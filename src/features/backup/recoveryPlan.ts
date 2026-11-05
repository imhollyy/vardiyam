export type RecoveryState = 'staging' | 'prepared' | 'committed';
export type RecoveryAction = 'discard-staging' | 'verify-live-and-finish' | 'restore-rollback' | 'finish-commit' | 'fail-closed';

export function decideRecoveryAction(state: RecoveryState, liveExists: boolean, rollbackExists: boolean): RecoveryAction {
  if (state === 'staging') return liveExists ? 'discard-staging' : 'fail-closed';
  if (state === 'prepared') {
    if (rollbackExists) return 'restore-rollback';
    return liveExists ? 'verify-live-and-finish' : 'fail-closed';
  }
  if (liveExists) return 'finish-commit';
  return rollbackExists ? 'restore-rollback' : 'fail-closed';
}
