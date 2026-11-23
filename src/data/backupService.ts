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

const WIPE_TEMP_NAME = '__vdywipe.db';

export async function createEmptyDatabaseForWipe(): Promise<SQLiteDatabase> {
  // Use a named temp file (not :memory:) to avoid sharing a connection with createReferenceDatabase,
  // which also opens :memory: during validateBackupDatabase — Expo SQLite may return the same handle.
  await SQLite.deleteDatabaseAsync(WIPE_TEMP_NAME).catch(() => {});
  const empty = await SQLite.openDatabaseAsync(WIPE_TEMP_NAME);
  try {
    await empty.execAsync('PRAGMA foreign_keys = ON;');
    const { initializeDatabase } = await import('./database.ts');
    const initResult = await initializeDatabase(empty);
    if (initResult.needsReset) throw new Error('Boş veritabanı şeması beklenmeyen durumda.');
    const validation = await validateBackupDatabase(empty, { createReferenceDatabase, expectedSchemaVersion: CURRENT_SCHEMA_VERSION });
    // settings table always has 1 default row after initialization; only user data tables must be empty
    if (validation.recordCount !== 1) throw new Error('Boş veritabanı hazırlanamadı.');
    return empty;
  } catch (error) {
    await empty.closeAsync();
    await SQLite.deleteDatabaseAsync(WIPE_TEMP_NAME).catch(() => {});
    throw error;
  }
}

export async function applyDataWipe(
  current: SQLiteDatabase,
  emptyDatabase: SQLiteDatabase,
  controls: DatabaseMaintenanceControls,
): Promise<void> {
  // validateCurrent is called on both the new stage AND the old rollback copy.
  // The old live DB may have many records, so we must not assert count === 1 here;
  // replaceLiveDatabase's own consistency checks (copyCount vs sourceCount, digest match) are sufficient.
  await replaceLiveDatabase(current, emptyDatabase, controls, (restored) => validateCurrentSchema(restored));
}
