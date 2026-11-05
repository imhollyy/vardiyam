import { getRandomBytesAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { sha256 } from '@noble/hashes/sha2.js';
import { executeSafeDatabaseSwap } from '@/src/features/backup/safeDatabaseSwap';
import { decideRecoveryAction } from '@/src/features/backup/recoveryPlan';
import { validateBackupDatabase } from './backupValidation.ts';
import { CURRENT_SCHEMA_VERSION } from './migrations.ts';

const DATABASE_NAME = 'vardiyam.db';
const MARKER_NAME = 'vardiyam-database-maintenance.json';
const TEMP_NAME = /^vdy-(?:stage|rollback)-[0-9a-f]{16}\.db$/;

type MaintenanceMarker = {
  version: 1;
  state: 'staging' | 'prepared' | 'committed';
  stageName: string;
  rollbackName: string;
  rollbackDigest?: string;
  rollbackRecordCount?: number;
};

export type DatabaseMaintenanceControls = {
  closeCurrent: () => Promise<void>;
  reopenCurrent: () => Promise<SQLiteDatabase>;
};

export async function createTemporaryDatabaseName(prefix: 'stage' | 'rollback'): Promise<string> {
  const random = await getRandomBytesAsync(8);
  const suffix = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
  random.fill(0);
  return `vdy-${prefix}-${suffix}.db`;
}

export async function replaceLiveDatabase(
  current: SQLiteDatabase,
  staged: SQLiteDatabase,
  controls: DatabaseMaintenanceControls,
  validateCurrent: (database: SQLiteDatabase) => Promise<number>,
): Promise<void> {
  const stageName = await createTemporaryDatabaseName('stage');
  const rollbackName = await createTemporaryDatabaseName('rollback');
  let stageOpen: SQLiteDatabase | null = null;
  let rollbackOpen: SQLiteDatabase | null = null;
  let rollbackDigest: string | undefined;
  let rollbackRecordCount: number | undefined;
  await executeSafeDatabaseSwap({
    markStaging: () => writeMarker({ version: 1, state: 'staging', stageName, rollbackName }),
    prepareStage: async () => {
      stageOpen = await SQLite.openDatabaseAsync(stageName);
      await SQLite.backupDatabaseAsync({ sourceDatabase: staged, destDatabase: stageOpen });
      await stageOpen.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      await stageOpen.closeAsync(); stageOpen = null;
    },
    prepareRollback: async () => {
      const sourceCount = await validateCurrent(current);
      const sourceImage = await current.serializeAsync();
      rollbackOpen = await SQLite.openDatabaseAsync(rollbackName);
      await SQLite.backupDatabaseAsync({ sourceDatabase: current, destDatabase: rollbackOpen });
      await rollbackOpen.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      const copyCount = await validateCurrent(rollbackOpen);
      const rollbackImage = await rollbackOpen.serializeAsync();
      if (copyCount !== sourceCount || !equalBytes(sourceImage, rollbackImage)) {
        sourceImage.fill(0); rollbackImage.fill(0);
        throw new Error('Geri dönüş kopyası özgün verilerle eşleşmiyor.');
      }
      rollbackRecordCount = copyCount;
      rollbackDigest = toHex(sha256(rollbackImage));
      sourceImage.fill(0); rollbackImage.fill(0);
      await rollbackOpen.closeAsync(); rollbackOpen = null;
    },
    markPrepared: () => {
      if (!rollbackDigest || rollbackRecordCount === undefined) throw new Error('Doğrulanmış geri dönüş kopyası bulunamadı.');
      return writeMarker({ version: 1, state: 'prepared', stageName, rollbackName, rollbackDigest, rollbackRecordCount });
    },
    closeLive: controls.closeCurrent,
    replaceLive: async () => {
      await deleteDatabaseIfPresent(DATABASE_NAME);
      await databaseFile(stageName).move(databaseFile(DATABASE_NAME));
    },
    reopenAndValidate: async () => { await validateCurrent(await controls.reopenCurrent()); },
    markCommitted: () => writeMarker({ version: 1, state: 'committed', stageName, rollbackName, rollbackDigest, rollbackRecordCount }),
    restoreRollback: async () => {
      await stageOpen?.closeAsync().catch(() => undefined);
      await rollbackOpen?.closeAsync().catch(() => undefined);
      await controls.closeCurrent();
      await restoreRollbackDatabase({ stageName, rollbackName, rollbackDigest, rollbackRecordCount });
      await controls.reopenCurrent();
    },
    cleanupUncommitted: async () => {
      await stageOpen?.closeAsync().catch(() => undefined);
      await rollbackOpen?.closeAsync().catch(() => undefined);
      await deleteDatabaseIfPresent(stageName);
      await deleteDatabaseIfPresent(rollbackName);
      await deleteMarker();
    },
    cleanupCommitted: () => cleanupCommittedMarker({ stageName, rollbackName }),
  }).catch(() => {
    throw new Error('Geri yükleme tamamlanamadı; önceki veritabanı geri yüklendi veya güvenlik kopyası korunuyor.');
  });
}

export async function wipeLiveDatabase(
  current: SQLiteDatabase,
  stagedEmpty: SQLiteDatabase,
  controls: DatabaseMaintenanceControls,
  validateEmpty: (database: SQLiteDatabase) => Promise<number>,
): Promise<void> {
  await replaceLiveDatabase(current, stagedEmpty, controls, validateEmpty);
}

export async function recoverPendingDatabaseMaintenance(): Promise<void> {
  const markerFile = new File(Paths.document, MARKER_NAME);
  if (!markerFile.exists) return;
  let marker: MaintenanceMarker;
  try {
    marker = JSON.parse(await markerFile.text()) as MaintenanceMarker;
  } catch {
    throw new Error('Veritabanı kurtarma bilgisi okunamıyor. Uygulama verileri güvenlik için açılmadı.');
  }
  if (
    marker.version !== 1 || !TEMP_NAME.test(marker.stageName) || !TEMP_NAME.test(marker.rollbackName) ||
    !['staging', 'prepared', 'committed'].includes(marker.state) ||
    (marker.state !== 'staging' && (!marker.rollbackDigest || !/^[0-9a-f]{64}$/.test(marker.rollbackDigest) || !Number.isSafeInteger(marker.rollbackRecordCount) || marker.rollbackRecordCount! < 0))
  ) throw new Error('Veritabanı kurtarma bilgisi geçersiz. Uygulama verileri güvenlik için açılmadı.');

  const recoveryAction = decideRecoveryAction(marker.state, databaseFile(DATABASE_NAME).exists, databaseFile(marker.rollbackName).exists);
  if (recoveryAction === 'discard-staging') {
    await deleteDatabaseIfPresent(marker.stageName);
    await deleteDatabaseIfPresent(marker.rollbackName);
    markerFile.delete();
    return;
  }

  const rollbackExists = databaseFile(marker.rollbackName).exists;
  if (recoveryAction === 'verify-live-and-finish') {
    await verifyRecoveryDatabase(DATABASE_NAME, marker);
    await deleteDatabaseIfPresent(marker.stageName);
    markerFile.delete();
    return;
  }
  if (recoveryAction === 'fail-closed') {
    throw new Error('Geri yükleme yarıda kesilmiş ve doğrulanmış geri dönüş kopyası bulunamıyor. Uygulama verileri açılmadı.');
  }
  if (recoveryAction === 'restore-rollback') {
    if (!rollbackExists) {
      throw new Error('Geri yükleme yarıda kesilmiş ve doğrulanmış geri dönüş kopyası bulunamıyor. Uygulama verileri açılmadı.');
    }
    await verifyRecoveryDatabase(marker.rollbackName, marker);
    await deleteDatabaseIfPresent(DATABASE_NAME);
    await databaseFile(marker.rollbackName).move(databaseFile(DATABASE_NAME));
    await verifyRecoveryDatabase(DATABASE_NAME, marker);
    await deleteDatabaseIfPresent(marker.stageName);
    markerFile.delete();
    return;
  }
  await deleteDatabaseIfPresent(marker.stageName);
  await deleteDatabaseIfPresent(marker.rollbackName);
  markerFile.delete();
}

async function restoreRollbackDatabase(marker: Pick<MaintenanceMarker, 'stageName' | 'rollbackName' | 'rollbackDigest' | 'rollbackRecordCount'>): Promise<void> {
  if (!databaseFile(marker.rollbackName).exists) throw new Error('Geri dönüş kopyası bulunamadı.');
  const verificationMarker: MaintenanceMarker = { version: 1, state: 'prepared', ...marker };
  await verifyRecoveryDatabase(marker.rollbackName, verificationMarker);
  await deleteDatabaseIfPresent(DATABASE_NAME);
  await databaseFile(marker.rollbackName).move(databaseFile(DATABASE_NAME));
  await verifyRecoveryDatabase(DATABASE_NAME, verificationMarker);
  await deleteDatabaseIfPresent(marker.stageName);
  await deleteMarker();
}

async function verifyRecoveryDatabase(name: string, marker: MaintenanceMarker): Promise<void> {
  if (!marker.rollbackDigest || marker.rollbackRecordCount === undefined || !databaseFile(name).exists) {
    throw new Error('Geri dönüş veritabanı eksik veya doğrulama bilgisi yok.');
  }
  const database = await SQLite.openDatabaseAsync(name);
  try {
    const validation = await validateBackupDatabase(database, {
      createReferenceDatabase: async () => {
        const reference = await SQLite.openDatabaseAsync(':memory:');
        return { database: reference, close: () => reference.closeAsync() };
      },
      expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
    });
    const image = await database.serializeAsync();
    const digest = toHex(sha256(image));
    image.fill(0);
    if (validation.recordCount !== marker.rollbackRecordCount || digest !== marker.rollbackDigest) {
      throw new Error('Geri dönüş veritabanı özgün kopyayla eşleşmiyor.');
    }
  } finally {
    await database.closeAsync();
  }
}

async function cleanupCommittedMarker(marker: Pick<MaintenanceMarker, 'stageName' | 'rollbackName'>): Promise<void> {
  try {
    await deleteDatabaseIfPresent(marker.stageName);
    await deleteDatabaseIfPresent(marker.rollbackName);
    await deleteMarker();
  } catch {
    // The committed marker is intentionally left for safe cleanup on next startup.
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function writeMarker(marker: MaintenanceMarker): Promise<void> {
  const file = new File(Paths.document, MARKER_NAME);
  const temporary = new File(Paths.document, `${MARKER_NAME}.tmp`);
  if (temporary.exists) temporary.delete();
  await temporary.write(JSON.stringify(marker));
  await temporary.move(file, { overwrite: true });
}

async function deleteMarker(): Promise<void> {
  const file = new File(Paths.document, MARKER_NAME);
  if (file.exists) file.delete();
  const temporary = new File(Paths.document, `${MARKER_NAME}.tmp`);
  if (temporary.exists) temporary.delete();
}

async function deleteDatabaseIfPresent(name: string): Promise<void> {
  if (!TEMP_NAME.test(name) && name !== DATABASE_NAME) throw new Error('Beklenmeyen veritabanı adı.');
  if (databaseFile(name).exists) await SQLite.deleteDatabaseAsync(name);
}

function databaseFile(name: string): File {
  const directory = SQLite.defaultDatabaseDirectory;
  if (!directory) throw new Error('SQLite veritabanı konumu alınamadı.');
  return new File(`${directory.replace(/\/$/, '')}/${name}`);
}
