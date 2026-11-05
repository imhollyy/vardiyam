export type RecoveryState = 'staging' | 'prepared' | 'committed';
export type RecoveryAction = 'discard-staging' | 'finish-commit' | 'restore-rollback' | 'finish-rollback';

export type RecoveryMarker = {
  version: 2;
  state: RecoveryState;
  stageName: string;
  rollbackName: string;
  candidateDigest?: string;
  candidateRecordCount?: number;
  rollbackDigest?: string;
  rollbackRecordCount?: number;
};

export type RecoveryPort = {
  liveExists: boolean;
  rollbackExists: boolean;
  verifyCandidate: (name: string, marker: RecoveryMarker) => Promise<boolean>;
  verifyRollback: (name: string, marker: RecoveryMarker) => Promise<boolean>;
  verifyLiveAsRollback: (marker: RecoveryMarker) => Promise<boolean>;
  restoreRollback: (rollbackName: string, liveName: string, marker: RecoveryMarker) => Promise<void>;
  cleanupStaging: (stageName: string, rollbackName: string) => Promise<void>;
  cleanupCommitted: (stageName: string, rollbackName: string) => Promise<void>;
  deleteMarker: () => Promise<void>;
};

export function parseRecoveryMarker(value: string): RecoveryMarker {
  let marker: unknown;
  try { marker = JSON.parse(value); }
  catch { throw new Error('Veritabanı kurtarma bilgisi okunamıyor.'); }
  if (!marker || typeof marker !== 'object') throw new Error('Veritabanı kurtarma bilgisi geçersiz.');
  const candidate = marker as Partial<RecoveryMarker>;
  if (candidate.version !== 2 || !['staging', 'prepared', 'committed'].includes(candidate.state ?? '') ||
    typeof candidate.stageName !== 'string' || typeof candidate.rollbackName !== 'string') {
    throw new Error('Veritabanı kurtarma bilgisi geçersiz.');
  }
  if (candidate.state !== 'staging' &&
    (!isDigest(candidate.candidateDigest) || !isCount(candidate.candidateRecordCount) ||
      !isDigest(candidate.rollbackDigest) || !isCount(candidate.rollbackRecordCount))) {
    throw new Error('Veritabanı kurtarma bilgisi geçersiz.');
  }
  return candidate as RecoveryMarker;
}

export async function recoverDatabaseState(liveName: string, marker: RecoveryMarker, port: RecoveryPort): Promise<RecoveryAction> {
  if (marker.state === 'staging') {
    if (!port.liveExists) throw new Error('Kurtarma tamamlanamıyor; canlı veritabanı yok.');
    await port.cleanupStaging(marker.stageName, marker.rollbackName);
    await port.deleteMarker();
    return 'discard-staging';
  }

  const rollbackValid = port.rollbackExists && await port.verifyRollback(marker.rollbackName, marker);
  if (marker.state === 'prepared') {
    if (port.liveExists && await port.verifyLiveAsRollback(marker)) {
      await port.cleanupStaging(marker.stageName, marker.rollbackName);
      await port.deleteMarker();
      return 'finish-rollback';
    }
    if (rollbackValid) {
      await port.restoreRollback(marker.rollbackName, liveName, marker);
      if (!await port.verifyLiveAsRollback(marker)) throw new Error('Geri dönüş kopyası doğrulanamadı.');
      await port.cleanupCommitted(marker.stageName, marker.rollbackName);
      await port.deleteMarker();
      return 'restore-rollback';
    }
    throw new Error('Hazırlanmış veritabanı doğrulanamadı ve sağlam geri dönüş kopyası yok.');
  }

  if (port.liveExists && await port.verifyCandidate(liveName, marker)) {
    await port.cleanupCommitted(marker.stageName, marker.rollbackName);
    await port.deleteMarker();
    return 'finish-commit';
  }
  if (port.liveExists && await port.verifyLiveAsRollback(marker)) {
    await port.cleanupStaging(marker.stageName, marker.rollbackName);
    await port.deleteMarker();
    return 'finish-rollback';
  }
  if (rollbackValid) {
    await port.restoreRollback(marker.rollbackName, liveName, marker);
    if (!await port.verifyLiveAsRollback(marker)) throw new Error('Geri dönüş kopyası doğrulanamadı.');
    await port.cleanupCommitted(marker.stageName, marker.rollbackName);
    await port.deleteMarker();
    return 'restore-rollback';
  }
  throw new Error('Canlı veritabanı doğrulanamadı ve sağlam geri dönüş kopyası yok.');
}

function isDigest(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function isCount(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
