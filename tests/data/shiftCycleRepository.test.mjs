import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { buildShiftSchedule } from '../../src/features/shifts/schedule.ts';
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
  saveShiftSchedule,
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

test('saving an edited schedule is atomic and keeps existing date overrides', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [
      day(),
      { ...day('evening'), code: 'E', name: 'Evening', startLocalTime: '16:00', endLocalTime: '00:00' },
    ];
    const initial = {
      id: 'cycle', name: 'Cycle', timezone: 'Europe/Istanbul', anchorLocalDate: '2026-01-01', startIndex: 0,
      entries: [{ kind: 'SHIFT', templateId: 'day' }, { kind: 'OFF' }],
    };
    await saveShiftSchedule(database, templates, initial);
    await createPlanOverride(database, 'cycle', { localDate: '2026-01-02', kind: 'LEAVE' });

    const updatedTemplates = templates.map((template) =>
      template.id === 'day' ? { ...template, name: 'Day updated' } : template,
    );
    const updated = {
      ...initial,
      name: 'Updated cycle',
      anchorLocalDate: '2026-02-01',
      startIndex: 1,
      entries: [{ kind: 'SHIFT', templateId: 'evening' }, { kind: 'OFF' }],
    };
    await saveShiftSchedule(database, updatedTemplates, updated);

    assert.deepEqual(await getShiftCycle(database, 'cycle'), updated);
    assert.equal((await getShiftTemplate(database, 'day')).name, 'Day updated');
    assert.deepEqual(await listPlanOverrides(database, 'cycle'), [
      { localDate: '2026-01-02', kind: 'LEAVE' },
    ]);
  } finally { sqlite.close(); }
});

test('repository edit round-trip keeps the saved cycle phase exactly', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day(), { ...day('evening'), code: 'E', name: 'Evening' }, { ...day('night'), code: 'N', name: 'Night' }];
    const saved = {
      id: 'cycle', name: 'Weekly', timezone: 'Europe/Istanbul', anchorLocalDate: '2026-01-01', startIndex: 10,
      entries: Array.from({ length: 21 }, (_, index) => ({ kind: 'SHIFT', templateId: templates[Math.floor(index / 7)].id })),
    };
    await saveShiftSchedule(database, templates, saved);
    const loaded = await getShiftCycle(database, 'cycle');
    const templateIndex = templates.findIndex((template) => template.id === loaded.entries[loaded.startIndex].templateId);
    const rebuilt = buildShiftSchedule({
      id: loaded.id, name: loaded.name, timezone: loaded.timezone, anchorLocalDate: loaded.anchorLocalDate,
      pattern: 'weekly-three', startTemplateIndex: templateIndex, preservedStartEntryIndex: loaded.startIndex,
      templates, customEntries: [],
    });
    assert.deepEqual(rebuilt.cycle, loaded);
  } finally { sqlite.close(); }
});

test('failed schedule save rolls back earlier template inserts and the cycle', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    const templates = [
      { ...day('new'), code: 'N', name: 'Night' },
      { ...day('conflict'), code: 'D', name: 'Conflicting day' },
    ];
    const cycle = {
      id: 'cycle', name: 'Should rollback', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-01', startIndex: 0,
      entries: [
        { kind: 'SHIFT', templateId: 'new' },
        { kind: 'SHIFT', templateId: 'conflict' },
      ],
    };

    await assert.rejects(saveShiftSchedule(database, templates, cycle));
    assert.equal(await getShiftTemplate(database, 'new'), null);
    assert.equal(await getShiftTemplate(database, 'conflict'), null);
    assert.equal(await getShiftCycle(database, 'cycle'), null);
    assert.deepEqual(await listShiftCycles(database), []);
  } finally { sqlite.close(); }
});

test('saved schedule and overrides survive closing and reopening the SQLite database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-schedule-'));
  const path = join(directory, 'schedule.db');
  let sqlite = new DatabaseSync(path);
  try {
    let database = createAdapter(sqlite);
    await initializeDatabase(database);
    const templates = [day(), { ...day('evening'), code: 'E', name: 'Evening', startLocalTime: '16:00', endLocalTime: '00:00' }];
    const savedCycle = {
      id: 'persistent-cycle', name: 'Persistent', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-12-31', startIndex: 0,
      entries: [{ kind: 'SHIFT', templateId: 'day' }, { kind: 'OFF' }],
    };
    await saveShiftSchedule(database, templates, savedCycle);
    await createPlanOverride(database, savedCycle.id, { localDate: '2027-01-01', kind: 'LEAVE' });
    sqlite.close();

    sqlite = new DatabaseSync(path);
    database = createAdapter(sqlite);
    await initializeDatabase(database);
    assert.deepEqual(await getShiftCycle(database, savedCycle.id), savedCycle);
    assert.equal((await getPlannedShiftForDate(database, savedCycle.id, '2026-12-31')).templateId, 'day');
    assert.equal((await getPlannedShiftForDate(database, savedCycle.id, '2027-01-01')).kind, 'LEAVE');
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
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
