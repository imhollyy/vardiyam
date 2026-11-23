import { getRandomBytesAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { executeSafeDatabaseSwap } from '@/src/features/backup/safeDatabaseSwap';
import { parseRecoveryMarker, recoverDatabaseState, type RecoveryMarker } from '@/src/features/backup/recoveryEngine';
import { validateBackupDatabase } from './backupValidation.ts';
import { CURRENT_SCHEMA_VERSION } from './migrations.ts';
import { computeLogicalDigest } from './logicalDigest.ts';

const DATABASE_NAME = 'vardiyam.db';
const MARKER_NAME = 'vardiyam-database-maintenance.json';
const TEMP_NAME = /^vdy-(?:stage|rollback)-[0-9a-f]{16}\.db$/;

type MaintenanceMarker = RecoveryMarker;

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
  let candidateDigest: string | undefined;
  let candidateRecordCount: number | undefined;
  let rollbackDigest: string | undefined;
  let rollbackRecordCount: number | undefined;
  await executeSafeDatabaseSwap({
    markStaging: () => writeMarker({ version: 3, state: 'staging', stageName, rollbackName }),
    prepareStage: async () => {
      stageOpen = await SQLite.openDatabaseAsync(stageName);
      await SQLite.backupDatabaseAsync({ sourceDatabase: staged, destDatabase: stageOpen });
      await stageOpen.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      candidateRecordCount = await validateCurrent(stageOpen);
      candidateDigest = await computeLogicalDigest(stageOpen);
      await stageOpen.closeAsync(); stageOpen = null;
    },
    prepareRollback: async () => {
      const sourceCount = await validateCurrent(current);
      const sourceDigest = await computeLogicalDigest(current);
      rollbackOpen = await SQLite.openDatabaseAsync(rollbackName);
      await SQLite.backupDatabaseAsync({ sourceDatabase: current, destDatabase: rollbackOpen });
      await rollbackOpen.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
      const copyCount = await validateCurrent(rollbackOpen);
      const rollbackCopyDigest = await computeLogicalDigest(rollbackOpen);
      if (copyCount !== sourceCount || rollbackCopyDigest !== sourceDigest) {
        throw new Error('Geri dönüş kopyası özgün verilerle eşleşmiyor.');
      }
      rollbackRecordCount = copyCount;
      rollbackDigest = rollbackCopyDigest;
      await rollbackOpen.closeAsync(); rollbackOpen = null;
    },
    markPrepared: () => {
      if (!candidateDigest || candidateRecordCount === undefined || !rollbackDigest || rollbackRecordCount === undefined) {
        throw new Error('Doğrulanmış yeni ve eski veritabanı kopyaları bulunamadı.');
      }
      return writeMarker({ version: 3, state: 'prepared', stageName, rollbackName, candidateDigest, candidateRecordCount, rollbackDigest, rollbackRecordCount });
    },
    closeLive: controls.closeCurrent,
    replaceLive: async () => {
      await deleteDatabaseIfPresent(DATABASE_NAME);
      await databaseFile(stageName).move(databaseFile(DATABASE_NAME));
    },
    reopenAndValidate: async () => {
      const reopened = await controls.reopenCurrent();
      const recordCount = await validateCurrent(reopened);
      const digest = await computeLogicalDigest(reopened);
      if (recordCount !== candidateRecordCount || digest !== candidateDigest) {
        throw new Error('Yeni veritabanı doğrulanmış aday kopyayla eşleşmiyor.');
      }
    },
    markCommitted: () => writeMarker({
      version: 3, state: 'committed', stageName, rollbackName, candidateDigest: candidateDigest!, candidateRecordCount: candidateRecordCount!,
      rollbackDigest: rollbackDigest!, rollbackRecordCount: rollbackRecordCount!,
    }),
    restoreRollback: async () => {
      await stageOpen?.closeAsync().catch(() => undefined);
      await rollbackOpen?.closeAsync().catch(() => undefined);
      await controls.closeCurrent();
      await restoreRollbackDatabase({
        stageName, rollbackName,
        rollbackDigest: rollbackDigest!, rollbackRecordCount: rollbackRecordCount!,
      });
      await controls.reopenCurrent();
      await verifyRecoveryDatabase(DATABASE_NAME, rollbackDigest!, rollbackRecordCount!);
      await cleanupCommittedMarker({ stageName, rollbackName });
      await deleteMarker();
    },
    cleanupUncommitted: async () => {
      await stageOpen?.closeAsync().catch(() => undefined);
      await rollbackOpen?.closeAsync().catch(() => undefined);
      await deleteDatabaseIfPresent(stageName);
      await deleteDatabaseIfPresent(rollbackName);
      await deleteMarker();
    },
    cleanupCommitted: async () => {
      await cleanupCommittedMarker({ stageName, rollbackName });
      await deleteMarker();
    },
  }).catch((err: unknown) => {
    const detail = err instanceof Error ? ` [${err.message}]` : '';
    throw new Error(`Geri yükleme tamamlanamadı${detail}; önceki veritabanı geri yüklendi veya güvenlik kopyası korunuyor.`);
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
    marker = parseRecoveryMarker(await markerFile.text());
  } catch {
    throw new Error('Veritabanı kurtarma bilgisi geçersiz veya okunamıyor. Uygulama verileri güvenlik için açılmadı.');
  }
  if (!TEMP_NAME.test(marker.stageName) || !TEMP_NAME.test(marker.rollbackName)) {
    throw new Error('Veritabanı kurtarma yolları geçersiz. Uygulama verileri açılmadı.');
  }

  await recoverDatabaseState(DATABASE_NAME, marker, {
    liveExists: databaseFile(DATABASE_NAME).exists,
    rollbackExists: databaseFile(marker.rollbackName).exists,
    verifyCandidate: (name, data) => safelyVerifyRecoveryDatabase(name, data.candidateDigest!, data.candidateRecordCount!),
    verifyRollback: (name, data) => safelyVerifyRecoveryDatabase(name, data.rollbackDigest!, data.rollbackRecordCount!),
    verifyLiveAsRollback: (data) => safelyVerifyRecoveryDatabase(DATABASE_NAME, data.rollbackDigest!, data.rollbackRecordCount!),
    restoreRollback: (rollbackName, liveName, data) => restoreRollbackDatabase({ ...data, rollbackName, stageName: data.stageName, rollbackDigest: data.rollbackDigest, rollbackRecordCount: data.rollbackRecordCount }),
    cleanupStaging: async (stageName, rollbackName) => {
      await deleteDatabaseIfPresent(stageName);
      await deleteDatabaseIfPresent(rollbackName);
    },
    cleanupCommitted: (stageName, rollbackName) => cleanupCommittedMarker({ stageName, rollbackName }),
    deleteMarker,
  }).catch(() => {
    throw new Error('Veritabanı kurtarma doğrulanamadı. Uygulama verileri değiştirilmeden kilitlendi; kurtarma kopyaları korundu.');
  });
}

async function restoreRollbackDatabase(marker: Pick<MaintenanceMarker, 'stageName' | 'rollbackName' | 'rollbackDigest' | 'rollbackRecordCount'>): Promise<void> {
  if (!databaseFile(marker.rollbackName).exists) throw new Error('Geri dönüş kopyası bulunamadı.');
  await verifyRecoveryDatabase(marker.rollbackName, marker.rollbackDigest!, marker.rollbackRecordCount!);
  await deleteDatabaseIfPresent(DATABASE_NAME);
  const rollback = await SQLite.openDatabaseAsync(marker.rollbackName);
  let live: SQLiteDatabase | null = null;
  try {
    live = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await SQLite.backupDatabaseAsync({ sourceDatabase: rollback, destDatabase: live });
    await live.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } finally {
    await live?.closeAsync().catch(() => undefined);
    await rollback.closeAsync();
  }
  await verifyRecoveryDatabase(DATABASE_NAME, marker.rollbackDigest!, marker.rollbackRecordCount!);
}

async function safelyVerifyRecoveryDatabase(name: string, digest: string, recordCount: number): Promise<boolean> {
  try { await verifyRecoveryDatabase(name, digest, recordCount); return true; }
  catch { return false; }
}

async function verifyRecoveryDatabase(name: string, expectedDigest: string, expectedRecordCount: number): Promise<void> {
  if (!databaseFile(name).exists) {
    throw new Error('Kurtarma veritabanı eksik.');
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
    const digest = await computeLogicalDigest(database);
    if (validation.recordCount !== expectedRecordCount || digest !== expectedDigest) {
      throw new Error('Veritabanı beklenen doğrulanmış görüntüyle eşleşmiyor.');
    }
  } finally {
    await database.closeAsync();
  }
}

async function cleanupCommittedMarker(marker: Pick<MaintenanceMarker, 'stageName' | 'rollbackName'>): Promise<void> {
  await deleteDatabaseIfPresent(marker.stageName);
  await deleteDatabaseIfPresent(marker.rollbackName);
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
