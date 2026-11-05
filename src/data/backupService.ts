import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createEncryptedBackup,
  decryptEncryptedBackup,
  type BackupPreview,
} from '@/src/features/backup/backupContainer';
import { expoBackupCrypto } from '@/src/features/backup/expoBackupCrypto';
import { validateBackupDatabase } from './backupValidation.ts';
import { CURRENT_SCHEMA_VERSION } from './migrations.ts';
import { withDatabaseOperation } from './transactions.ts';
import { replaceLiveDatabase, type DatabaseMaintenanceControls } from './backupFiles.ts';

async function createReferenceDatabase() {
  const database = await SQLite.openDatabaseAsync(':memory:');
  return { database, close: () => database.closeAsync() };
}

async function validateCurrentSchema(database: SQLiteDatabase): Promise<number> {
  const validation = await validateBackupDatabase(database, {
    createReferenceDatabase,
    expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
  });
  return validation.recordCount;
}

export type RestorePreview = BackupPreview & { recordCount: number };

export async function createBackupFile(database: SQLiteDatabase, password: string): Promise<Uint8Array> {
  return withDatabaseOperation(database, async () => {
    const snapshot = await SQLite.openDatabaseAsync(':memory:');
    try {
      await SQLite.backupDatabaseAsync({ sourceDatabase: database, destDatabase: snapshot });
      const validation = await validateBackupDatabase(snapshot, { createReferenceDatabase, expectedSchemaVersion: CURRENT_SCHEMA_VERSION });
      const bytes = await snapshot.serializeAsync();
      return await createEncryptedBackup(bytes, {
        databaseSchemaVersion: validation.schemaVersion,
        sqliteVersion: validation.sqliteVersion,
      }, password, expoBackupCrypto);
    } finally {
      await snapshot.closeAsync();
    }
  });
}

export async function prepareRestoreFile(fileBytes: Uint8Array, password: string): Promise<{
  stagedDatabase: SQLiteDatabase;
  preview: RestorePreview;
}> {
  const decrypted = await decryptEncryptedBackup(fileBytes, password, expoBackupCrypto);
  const currentSqliteMajor = 3;
  if (Number(decrypted.preview.sqliteVersion.split('.')[0]) !== currentSqliteMajor) {
    decrypted.databaseBytes.fill(0);
    throw new Error('Bu yedek farklı bir SQLite ana sürümüyle oluşturulmuş ve güvenle doğrulanamıyor.');
  }

  let stagedDatabase: SQLiteDatabase | null = null;
  try {
    stagedDatabase = await SQLite.deserializeDatabaseAsync(decrypted.databaseBytes);
    decrypted.databaseBytes.fill(0);
    const validation = await validateBackupDatabase(stagedDatabase, {
      createReferenceDatabase,
      expectedSchemaVersion: decrypted.preview.databaseSchemaVersion,
      migrateToCurrent: true,
    });
    if (validation.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error('Yedek uygulamanın güncel şemasına yükseltilemedi.');
    return {
      stagedDatabase,
      preview: { ...decrypted.preview, recordCount: validation.recordCount },
    };
  } catch (error) {
    decrypted.databaseBytes.fill(0);
    await stagedDatabase?.closeAsync().catch(() => undefined);
    throw error;
  }
}

export async function applyPreparedRestore(
  current: SQLiteDatabase,
  stagedDatabase: SQLiteDatabase,
  preview: RestorePreview,
  controls: DatabaseMaintenanceControls,
): Promise<void> {
  await replaceLiveDatabase(current, stagedDatabase, controls, async (restored) => {
    const count = await validateCurrentSchema(restored);
    if (count !== preview.recordCount) throw new Error('Geri yüklenen kayıt sayısı doğrulanamadı.');
    return count;
  });
}

export async function createEmptyDatabaseForWipe(): Promise<SQLiteDatabase> {
  const empty = await SQLite.openDatabaseAsync(':memory:');
  try {
    await empty.execAsync('PRAGMA foreign_keys = ON;');
    const { initializeDatabase } = await import('./database.ts');
    await initializeDatabase(empty);
    const validation = await validateBackupDatabase(empty, { createReferenceDatabase, expectedSchemaVersion: CURRENT_SCHEMA_VERSION });
    if (validation.recordCount !== 0) throw new Error('Boş veritabanı hazırlanamadı.');
    return empty;
  } catch (error) {
    await empty.closeAsync();
    throw error;
  }
}

export async function applyDataWipe(
  current: SQLiteDatabase,
  emptyDatabase: SQLiteDatabase,
  controls: DatabaseMaintenanceControls,
): Promise<void> {
  await replaceLiveDatabase(current, emptyDatabase, controls, async (restored) => {
    const count = await validateCurrentSchema(restored);
    if (count !== 0) throw new Error('Silme sonrası bazı yerel kayıtlar kaldı.');
    return count;
  });
}
