import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRecoveryMarker, recoverDatabaseState } from '../../src/features/backup/recoveryEngine.ts';

const digest = 'a'.repeat(64);
const marker = (state) => ({
  version: 2, state, stageName: 'vdy-stage-0123456789abcdef.db', rollbackName: 'vdy-rollback-0123456789abcdef.db',
  candidateDigest: digest, candidateRecordCount: 1, rollbackDigest: 'b'.repeat(64), rollbackRecordCount: 1,
});

function port(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      liveExists: true,
      rollbackExists: true,
      async verifyCandidate() { calls.push('verify-candidate'); return false; },
      async verifyRollback() { calls.push('verify-rollback'); return false; },
      async verifyLiveAsRollback() { calls.push('verify-live-rollback'); return false; },
      async restoreRollback() { calls.push('restore'); },
      async cleanupStaging() { calls.push('cleanup-staging'); },
      async cleanupCommitted() { calls.push('cleanup-committed'); },
      async deleteMarker() { calls.push('delete-marker'); },
      ...overrides,
    },
  };
}

test('recovery engine validates marker, candidate and rollback before cleanup or fail-closed', async (t) => {
  await t.test('rejects corrupted marker without parsing a recovery path', () => {
    assert.throws(() => parseRecoveryMarker('{broken'));
    assert.throws(() => parseRecoveryMarker(JSON.stringify({ ...marker('committed'), candidateDigest: 'bad' })));
  });

  await t.test('staging without live database fails closed', async () => {
    const p = port({ liveExists: false });
    await assert.rejects(recoverDatabaseState('vardiyam.db', marker('staging'), p.value));
    assert.deepEqual(p.calls, []);
  });

  await t.test('prepared state restores verified rollback and revalidates live before cleanup', async () => {
    const p = port({ liveExists: false, async verifyRollback() { p.calls.push('verify-rollback'); return true; }, async verifyLiveAsRollback() { p.calls.push('verify-live-rollback'); return true; } });
    assert.equal(await recoverDatabaseState('vardiyam.db', marker('prepared'), p.value), 'restore-rollback');
    assert.deepEqual(p.calls, ['verify-rollback', 'restore', 'verify-live-rollback', 'cleanup-committed', 'delete-marker']);
  });

  await t.test('committed state preserves rollback when candidate validation fails', async () => {
    const p = port({ async verifyRollback() { p.calls.push('verify-rollback'); return true; }, async verifyLiveAsRollback() { p.calls.push('verify-live-rollback'); return true; } });
    assert.equal(await recoverDatabaseState('vardiyam.db', marker('committed'), p.value), 'finish-rollback');
    assert.deepEqual(p.calls, ['verify-rollback', 'verify-candidate', 'verify-live-rollback', 'cleanup-staging', 'delete-marker']);
  });

  await t.test('committed state removes rollback only after candidate validation', async () => {
    const p = port({ async verifyCandidate() { p.calls.push('verify-candidate'); return true; } });
    assert.equal(await recoverDatabaseState('vardiyam.db', marker('committed'), p.value), 'finish-commit');
    assert.deepEqual(p.calls, ['verify-rollback', 'verify-candidate', 'cleanup-committed', 'delete-marker']);
  });

  await t.test('invalid candidate and unavailable rollback fail closed without cleanup', async () => {
    const p = port({ rollbackExists: false });
    await assert.rejects(recoverDatabaseState('vardiyam.db', marker('committed'), p.value));
    assert.equal(p.calls.includes('cleanup-committed'), false);
    assert.equal(p.calls.includes('delete-marker'), false);
  });
});
