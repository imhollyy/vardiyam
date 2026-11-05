import assert from 'node:assert/strict';
import test from 'node:test';

import { decideRecoveryAction } from '../../src/features/backup/recoveryPlan.ts';

test('startup recovery fails closed or resumes the correct maintenance state after interruption', async (t) => {
  const cases = [
    ['staging files from interrupted preparation', 'staging', true, false, 'discard-staging'],
    ['staging marker without live database', 'staging', false, true, 'fail-closed'],
    ['prepared swap with preserved rollback', 'prepared', true, true, 'restore-rollback'],
    ['prepared swap before live replacement, rollback missing but live is verifiable', 'prepared', true, false, 'verify-live-and-finish'],
    ['prepared swap with neither live DB nor rollback', 'prepared', false, false, 'fail-closed'],
    ['committed swap with new live DB', 'committed', true, true, 'finish-commit'],
    ['committed swap after live removal with rollback retained', 'committed', false, true, 'restore-rollback'],
    ['committed state with no recoverable DB', 'committed', false, false, 'fail-closed'],
  ];
  for (const [name, state, live, rollback, expected] of cases) {
    await t.test(name, () => assert.equal(decideRecoveryAction(state, live, rollback), expected));
  }
});

test('wipe uses the same staged replacement and rollback recovery state machine', () => {
  assert.equal(decideRecoveryAction('prepared', true, true), 'restore-rollback');
  assert.equal(decideRecoveryAction('committed', true, true), 'finish-commit');
});
