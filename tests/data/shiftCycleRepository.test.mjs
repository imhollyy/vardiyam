import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import {
  createPlanOverride,
  createShiftCycle,
  createShiftTemplate,
  deletePlanOverride,
  deleteShiftCycle,
  deleteShiftTemplate,
  getPlannedShiftForDate,
  getPlannedShiftsForRange,
  getShiftCycle,
  getShiftTemplate,
  listPlanOverrides,
  listShiftCycles,
  updatePlanOverride,
  updateShiftCycle,
  updateShiftTemplate,
  ShiftStorageError,
} from '../../src/data/shiftCycleRepository.ts';

function createAdapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) {
      sqlite.exec('BEGIN;');
      try { await callback(); sqlite.exec('COMMIT;'); }
      catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
    },
  };
}

async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const database = createAdapter(sqlite);
  await initializeDatabase(database);
  return { sqlite, database };
}

const day = (id = 'day') => ({
  id,
  code: 'D',
  name: 'Day',
  startLocalTime: '08:00',
  endLocalTime: '16:00',
});
const cycle = (id = 'cycle') => ({
  id,
  name: 'Rotating',
  timezone: 'Europe/Istanbul',
  anchorLocalDate: '2026-01-01',
  startIndex: 0,
  entries: [{ kind: 'SHIFT', templateId: 'day' }, { kind: 'OFF' }],
});

test('template and cycle CRUD round-trip preserves ordered domain data', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    assert.deepEqual(await getShiftTemplate(database, 'day'), day());
    await updateShiftTemplate(database, { ...day(), name: 'Updated day', colorToken: 'blue' });
    assert.equal((await getShiftTemplate(database, 'day')).name, 'Updated day');
    await createShiftCycle(database, cycle());
    assert.deepEqual(await getShiftCycle(database, 'cycle'), cycle());
    assert.deepEqual(await listShiftCycles(database), [cycle()]);
    const updated = { ...cycle(), name: 'Updated cycle', startIndex: 1 };
    await updateShiftCycle(database, updated);
    assert.deepEqual(await getShiftCycle(database, 'cycle'), updated);
    assert.equal(await deleteShiftCycle(database, 'cycle'), true);
    assert.equal(await deleteShiftTemplate(database, 'day'), true);
  } finally { sqlite.close(); }
});

test('overrides persist SHIFT/OFF/LEAVE, enforce one per date, and do not shift the cycle', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle());
    const overrides = [
      { localDate: '2026-01-01', kind: 'OFF' },
      { localDate: '2026-01-02', kind: 'SHIFT', templateId: 'day', reason: 'cover' },
      { localDate: '2026-01-03', kind: 'LEAVE' },
    ];
    for (const override of overrides) await createPlanOverride(database, 'cycle', override);
    await assert.rejects(createPlanOverride(database, 'cycle', overrides[0]));
    assert.deepEqual(await listPlanOverrides(database, 'cycle'), overrides);
    await updatePlanOverride(database, 'cycle', '2026-01-01', { localDate: '2026-01-04', kind: 'LEAVE' });
    assert.equal(await deletePlanOverride(database, 'cycle', '2026-01-02'), true);
    assert.equal((await getPlannedShiftForDate(database, 'cycle', '2026-01-01')).kind, 'SHIFT');
    assert.equal((await getPlannedShiftForDate(database, 'cycle', '2026-01-02')).kind, 'OFF');
    assert.equal((await getPlannedShiftForDate(database, 'cycle', '2026-01-04')).kind, 'LEAVE');
  } finally { sqlite.close(); }
});

test('foreign keys, uniqueness and safe deletion preserve referenced rows', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await assert.rejects(createShiftTemplate(database, { ...day(), id: 'duplicate', name: 'duplicate' }));
    await assert.rejects(createShiftCycle(database, { ...cycle(), entries: [{ kind: 'SHIFT', templateId: 'missing' }] }));
    await createShiftCycle(database, cycle());
    await createPlanOverride(database, 'cycle', { localDate: '2026-02-01', kind: 'SHIFT', templateId: 'day' });
    await assert.rejects(deleteShiftTemplate(database, 'day'), (error) => error instanceof ShiftStorageError && error.code === 'TEMPLATE_IN_USE');
    await assert.rejects(deleteShiftCycle(database, 'cycle'), (error) => error instanceof ShiftStorageError && error.code === 'CYCLE_HAS_OVERRIDES');
    assert.ok(await getShiftCycle(database, 'cycle'));
    assert.ok(await getShiftTemplate(database, 'day'));
    assert.throws(() => sqlite.prepare("INSERT INTO plan_overrides (cycle_id, local_date, kind) VALUES ('absent', '2026-01-01', 'OFF');").run());
  } finally { sqlite.close(); }
});

test('failed cycle replacement rolls back parent update and prior entries', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle());
    sqlite.exec("CREATE TRIGGER reject_second_entry BEFORE INSERT ON cycle_entries WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    await assert.rejects(updateShiftCycle(database, { ...cycle(), name: 'must rollback', startIndex: 1 }));
    assert.deepEqual(await getShiftCycle(database, 'cycle'), cycle());
    sqlite.exec('DROP TRIGGER reject_second_entry;');
  } finally { sqlite.close(); }
});

test('database range projection matches the pure domain engine and rejects unsafe range size', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle());
    await createPlanOverride(database, 'cycle', { localDate: '2026-01-03', kind: 'LEAVE' });
    const projected = await getPlannedShiftsForRange(database, 'cycle', '2026-01-01', '2026-01-05');
    assert.deepEqual(projected.map(({ localDate, kind, source }) => [localDate, kind, source]), [
      ['2026-01-01', 'SHIFT', 'CYCLE'], ['2026-01-02', 'OFF', 'CYCLE'],
      ['2026-01-03', 'LEAVE', 'OVERRIDE'], ['2026-01-04', 'OFF', 'CYCLE'],
      ['2026-01-05', 'SHIFT', 'CYCLE'],
    ]);
    await assert.rejects(getPlannedShiftsForRange(database, 'cycle', '2026-01-01', '2037-01-01'), /limited to/);
  } finally { sqlite.close(); }
});
