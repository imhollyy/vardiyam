import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import {
  createShiftCycle,
  createShiftTemplate,
  deleteShiftCycle,
  deleteShiftTemplate,
  getShiftCycle,
  getShiftTemplate,
  listShiftCycles,
  listShiftTemplates,
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
  standardMinutes: 480,
});

const night = (id = 'night') => ({
  id,
  code: 'N',
  name: 'Night',
  startLocalTime: '22:00',
  endLocalTime: '06:00',
  standardMinutes: 480,
});

const cycle = (id = 'cycle') => ({
  id,
  name: 'Rotating',
  timezone: 'Europe/Istanbul',
  anchorLocalDate: '2026-01-01',
  startIndex: 0,
  entries: [{ kind: 'SHIFT', templateId: 'day' }, { kind: 'OFF' }],
});

test('template CRUD round-trip preserves all fields including standardMinutes', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    const loaded = await getShiftTemplate(database, 'day');
    assert.equal(loaded.id, 'day');
    assert.equal(loaded.code, 'D');
    assert.equal(loaded.name, 'Day');
    assert.equal(loaded.startLocalTime, '08:00');
    assert.equal(loaded.endLocalTime, '16:00');
    assert.equal(loaded.standardMinutes, 480);

    await updateShiftTemplate(database, { ...day(), name: 'Updated', startLocalTime: '09:00', standardMinutes: 540 });
    const updated = await getShiftTemplate(database, 'day');
    assert.equal(updated.name, 'Updated');
    assert.equal(updated.startLocalTime, '09:00');
    assert.equal(updated.standardMinutes, 540);
  } finally { sqlite.close(); }
});

test('cycle CRUD round-trip preserves ordered entries', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle());
    const loaded = await getShiftCycle(database, 'cycle');
    assert.deepEqual(loaded, cycle());
    assert.deepEqual(await listShiftCycles(database), [cycle()]);

    const updated = { ...cycle(), name: 'Updated', startIndex: 1 };
    await updateShiftCycle(database, updated);
    assert.deepEqual(await getShiftCycle(database, 'cycle'), updated);

    assert.equal(await deleteShiftCycle(database, 'cycle'), true);
    assert.equal(await deleteShiftTemplate(database, 'day'), true);
  } finally { sqlite.close(); }
});

test('saveShiftSchedule atomically saves templates and cycle', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day(), night()];
    const c = {
      id: 'c1', name: 'Two-shift', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-05', startIndex: 0,
      entries: [
        { kind: 'SHIFT', templateId: 'day' },
        { kind: 'SHIFT', templateId: 'night' },
        { kind: 'OFF' },
      ],
    };
    await saveShiftSchedule(database, templates, c, '2026-01-05');
    assert.deepEqual(await getShiftCycle(database, 'c1'), c);
    assert.equal((await listShiftTemplates(database)).length, 2);

    const updatedTemplates = templates.map((t) =>
      t.id === 'day' ? { ...t, startLocalTime: '09:00', standardMinutes: 540 } : t,
    );
    const updatedCycle = { ...c, name: 'Updated', anchorLocalDate: '2026-02-01', startIndex: 1 };
    await saveShiftSchedule(database, updatedTemplates, updatedCycle, '2026-02-01');

    assert.deepEqual(await getShiftCycle(database, 'c1'), updatedCycle);
    assert.equal((await getShiftTemplate(database, 'day')).startLocalTime, '09:00');
    assert.equal((await getShiftTemplate(database, 'day')).standardMinutes, 540);
  } finally { sqlite.close(); }
});

test('effectiveFrom is stored with the cycle', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle(), '2026-03-15');
    const row = sqlite.prepare("SELECT effective_from FROM shift_cycles WHERE id = 'cycle';").get();
    assert.equal(row.effective_from, '2026-03-15');
  } finally { sqlite.close(); }
});

test('saveShiftSchedule with new effectiveFrom creates a versioned cycle', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day()];
    const c = cycle();
    await saveShiftSchedule(database, templates, c, '2026-01-01');
    let row = sqlite.prepare("SELECT effective_from FROM shift_cycles WHERE id = 'cycle';").get();
    assert.equal(row.effective_from, '2026-01-01');

    await saveShiftSchedule(database, templates, { ...c, startIndex: 1 }, '2026-06-01');
    row = sqlite.prepare("SELECT effective_from FROM shift_cycles WHERE id = 'cycle';").get();
    assert.equal(row.effective_from, '2026-06-01');
    assert.equal((await getShiftCycle(database, 'cycle')).startIndex, 1);
  } finally { sqlite.close(); }
});

test('delete template in use raises TEMPLATE_IN_USE', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await createShiftCycle(database, cycle());
    await assert.rejects(
      deleteShiftTemplate(database, 'day'),
      (err) => err instanceof ShiftStorageError && err.code === 'TEMPLATE_IN_USE',
    );
  } finally { sqlite.close(); }
});

test('duplicate template code is rejected by DB unique constraint', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await assert.rejects(createShiftTemplate(database, { ...day(), id: 'dup', name: 'Dup' }));
  } finally { sqlite.close(); }
});

test('cycle with unknown template is rejected by domain validation', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    await assert.rejects(
      createShiftCycle(database, { ...cycle(), entries: [{ kind: 'SHIFT', templateId: 'missing' }] }),
    );
  } finally { sqlite.close(); }
});

test('failed saveShiftSchedule rolls back all changes', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, day());
    const conflictTemplates = [
      { ...night(), id: 'new-night' },
      { ...day(), id: 'conflict', code: 'D', name: 'Conflict' },
    ];
    const c = {
      id: 'bad', name: 'Bad', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-01', startIndex: 0,
      entries: [{ kind: 'SHIFT', templateId: 'new-night' }, { kind: 'SHIFT', templateId: 'conflict' }],
    };
    await assert.rejects(saveShiftSchedule(database, conflictTemplates, c));
    assert.equal(await getShiftTemplate(database, 'new-night'), null);
    assert.equal(await getShiftTemplate(database, 'conflict'), null);
    assert.equal(await getShiftCycle(database, 'bad'), null);
  } finally { sqlite.close(); }
});

test('MON_FRI two-shift cycle has 14 entries: 5 day + 2 off + 5 night + 2 off', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day(), night()];
    const entries = [
      ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'day' })),
      ...Array.from({ length: 2 }, () => ({ kind: 'OFF' })),
      ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'night' })),
      ...Array.from({ length: 2 }, () => ({ kind: 'OFF' })),
    ];
    const c = {
      id: 'two-shift', name: 'Mon-Fri Two', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-05', startIndex: 0, entries,
    };
    await saveShiftSchedule(database, templates, c, '2026-01-05');
    const loaded = await getShiftCycle(database, 'two-shift');
    assert.equal(loaded.entries.length, 14);
    assert.equal(loaded.entries[0].kind, 'SHIFT');
    assert.equal(loaded.entries[0].templateId, 'day');
    assert.equal(loaded.entries[5].kind, 'OFF');
    assert.equal(loaded.entries[7].kind, 'SHIFT');
    assert.equal(loaded.entries[7].templateId, 'night');
    assert.equal(loaded.entries[12].kind, 'OFF');
  } finally { sqlite.close(); }
});

test('MON_SAT fixed-day cycle has 7 entries: 6 shift + 1 off', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day()];
    const entries = [
      ...Array.from({ length: 6 }, () => ({ kind: 'SHIFT', templateId: 'day' })),
      { kind: 'OFF' },
    ];
    const c = {
      id: 'sat-fixed', name: 'Mon-Sat Fixed', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-05', startIndex: 0, entries,
    };
    await saveShiftSchedule(database, templates, c, '2026-01-05');
    const loaded = await getShiftCycle(database, 'sat-fixed');
    assert.equal(loaded.entries.length, 7);
    for (let i = 0; i < 6; i++) assert.equal(loaded.entries[i].kind, 'SHIFT');
    assert.equal(loaded.entries[6].kind, 'OFF');
  } finally { sqlite.close(); }
});

test('shift change re-aligns cycle with new startIndex', async () => {
  const { sqlite, database } = await setup();
  try {
    const templates = [day(), night()];
    const entries = [
      ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'day' })),
      { kind: 'OFF' }, { kind: 'OFF' },
      ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'night' })),
      { kind: 'OFF' }, { kind: 'OFF' },
    ];
    const c = {
      id: 'realign', name: 'Realign', timezone: 'Europe/Istanbul',
      anchorLocalDate: '2026-01-05', startIndex: 0, entries,
    };
    await saveShiftSchedule(database, templates, c, '2026-01-05');

    const shifted = { ...c, startIndex: 7, anchorLocalDate: '2026-01-19' };
    await saveShiftSchedule(database, templates, shifted, '2026-01-19');
    const loaded = await getShiftCycle(database, 'realign');
    assert.equal(loaded.startIndex, 7);
    assert.equal(loaded.anchorLocalDate, '2026-01-19');
    assert.equal(loaded.entries[loaded.startIndex].templateId, 'night');
  } finally { sqlite.close(); }
});
