import assert from 'node:assert/strict';
import test from 'node:test';

import { executeSafeDatabaseSwap } from '../../src/features/backup/safeDatabaseSwap.ts';

function effectsFor(state, overrides = {}) {
  const events = [];
  return {
    events,
    effects: {
      async markStaging() { events.push('marker:staging'); },
      async prepareStage() { state.stage = 'new'; events.push('stage'); },
      async prepareRollback() { state.rollback = state.live; events.push('rollback'); },
      async markPrepared() { events.push('marker:prepared'); },
      async closeLive() { state.closed = true; events.push('close'); },
      async replaceLive() { state.live = state.stage; events.push('replace'); },
      async reopenAndValidate() { state.closed = false; if (state.live !== 'new') throw new Error('invalid'); events.push('validate'); },
      async markCommitted() { events.push('marker:committed'); },
      async restoreRollback() { state.live = state.rollback; state.closed = false; events.push('restore'); },
      async cleanupUncommitted() { state.stage = null; state.rollback = null; events.push('cleanup:uncommitted'); },
      async cleanupCommitted() { state.stage = null; state.rollback = null; events.push('cleanup:committed'); },
      ...overrides,
    },
  };
}

test('safe database swap commits staged data and removes rollback copy only after validation', async () => {
  const state = { live: 'old', stage: null, rollback: null, closed: false };
  const { effects, events } = effectsFor(state);

  await executeSafeDatabaseSwap(effects);

  assert.equal(state.live, 'new');
  assert.equal(state.rollback, null);
  assert.ok(events.indexOf('validate') < events.indexOf('marker:committed'));
  assert.ok(events.indexOf('marker:committed') < events.indexOf('cleanup:committed'));
});

test('candidate preparation and disk replacement failures keep the original database', async (t) => {
  await t.test('stage failure before touching live data', async () => {
    const state = { live: 'old', stage: null, rollback: null, closed: false };
    const { effects } = effectsFor(state, { async prepareStage() { throw new Error('disk full'); } });
    await assert.rejects(executeSafeDatabaseSwap(effects));
    assert.equal(state.live, 'old');
    assert.equal(state.rollback, null);
  });

  await t.test('partial replace failure rolls back from preserved copy', async () => {
    const state = { live: 'old', stage: null, rollback: null, closed: false };
    const { effects, events } = effectsFor(state, { async replaceLive() { state.live = 'partial'; throw new Error('rename failed'); } });
    await assert.rejects(executeSafeDatabaseSwap(effects));
    assert.equal(state.live, 'old');
    assert.ok(events.includes('restore'));
  });

  await t.test('validation failure rolls back restored candidate', async () => {
    const state = { live: 'old', stage: null, rollback: null, closed: false };
    const { effects, events } = effectsFor(state, { async reopenAndValidate() { state.closed = false; throw new Error('integrity check failed'); } });
    await assert.rejects(executeSafeDatabaseSwap(effects));
    assert.equal(state.live, 'old');
    assert.ok(events.includes('restore'));
  });
});

test('failed rollback does not erase the retained recovery copy', async () => {
  const state = { live: 'old', stage: null, rollback: null, closed: false };
  const { effects } = effectsFor(state, {
    async replaceLive() { state.live = 'partial'; throw new Error('disk error'); },
    async restoreRollback() { throw new Error('disk remains unavailable'); },
  });

  await assert.rejects(executeSafeDatabaseSwap(effects));
  assert.equal(state.rollback, 'old');
});
