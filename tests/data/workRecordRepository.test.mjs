import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import {
  createPlanOverride,
  createShiftCycle,
  createShiftTemplate,
  deletePlanOverride,
  deleteShiftCycle,
  deleteShiftTemplate,
} from '../../src/data/shiftCycleRepository.ts';
import {
  createWorkRecord,
  deleteWorkRecord,
  getWorkRecord,
  listWorkRecords,
  updateWorkRecord,
  WorkRecordStorageError,
} from '../../src/data/workRecordRepository.ts';

function adapter(sqlite) {
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
  const database = adapter(sqlite);
  await initializeDatabase(database);
  return { sqlite, database };
}

const template = {
  id: 'day', code: 'D', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00',
};

const shiftCycle = (id = 'cycle') => ({
  id, name: 'Synthetic', timezone: 'Europe/Istanbul', anchorLocalDate: '2026-01-01', startIndex: 0,
  entries: [{ kind: 'SHIFT', templateId: 'day' }],
});

function manual(id, start, end, overrides = {}) {
  return {
    id,
    source: 'MANUAL',
    startedAtUtc: start,
    endedAtUtc: end,
    timezone: 'Europe/Istanbul',
    breakMinutes: 0,
    note: null,
    planned: null,
    ...overrides,
  };
}

function planned() {
  return {
    id: 'planned-record',
    source: 'PLANNED',
    startedAtUtc: '2026-01-01T05:05:00.000Z',
    endedAtUtc: '2026-01-01T13:05:00.000Z',
    timezone: 'Europe/Istanbul',
    breakMinutes: 30,
    note: 'synthetic marker',
    planned: {
      cycleId: 'cycle',
      localDate: '2026-01-01',
      templateId: 'day',
      templateName: 'Gündüz',
      startLocalDateTime: '2026-01-01T08:00',
      endLocalDateTime: '2026-01-01T16:00',
    },
  };
}

test('manual work record CRUD stores UTC instants and sorts history by actual date', async () => {
  const { sqlite, database } = await setup();
  try {
    const first = manual('manual-a', '2026-01-01T05:00:00.000Z', '2026-01-01T13:00:00.000Z');
    const second = manual('manual-b', '2026-01-02T05:00:00.000Z', '2026-01-02T13:00:00.000Z');
    await createWorkRecord(database, first);
    await createWorkRecord(database, second);
    assert.deepEqual(await getWorkRecord(database, 'manual-a'), first);
    assert.deepEqual(await listWorkRecords(database), [second, first]);

    const edited = { ...first, breakMinutes: 45, note: 'synthetic updated note' };
    await updateWorkRecord(database, edited);
    assert.deepEqual(await getWorkRecord(database, 'manual-a'), edited);
    assert.equal(await deleteWorkRecord(database, 'manual-a'), true);
    assert.equal(await deleteWorkRecord(database, 'manual-a'), false);
    assert.deepEqual(await listWorkRecords(database), [second]);
  } finally { sqlite.close(); }
});

test('unplanned work is saved without a schedule or planned date', async () => {
  const { sqlite, database } = await setup();
  try {
    const record = manual('unplanned', '2026-03-02T06:00:00.000Z', '2026-03-02T14:00:00.000Z');
    await createWorkRecord(database, record);
    assert.deepEqual(await getWorkRecord(database, 'unplanned'), record);
  } finally { sqlite.close(); }
});

test('overlap is rejected atomically, exact adjacency is allowed, and update excludes itself', async () => {
  const { sqlite, database } = await setup();
  try {
    const early = manual('early', '2026-02-01T05:00:00.000Z', '2026-02-01T07:00:00.000Z');
    const adjacent = manual('adjacent', '2026-02-01T07:00:00.000Z', '2026-02-01T09:00:00.000Z');
    await createWorkRecord(database, early);
    await createWorkRecord(database, adjacent);

    const overlapping = manual('overlap', '2026-02-01T06:59:00.000Z', '2026-02-01T08:00:00.000Z');
    await assert.rejects(createWorkRecord(database, overlapping), (error) =>
      error instanceof WorkRecordStorageError && error.code === 'OVERLAPPING_RECORD',
    );
    assert.equal(await getWorkRecord(database, 'overlap'), null);

    const selfUpdate = { ...early, startedAtUtc: '2026-02-01T05:30:00.000Z', endedAtUtc: '2026-02-01T06:30:00.000Z' };
    await updateWorkRecord(database, selfUpdate);
    assert.deepEqual(await getWorkRecord(database, 'early'), selfUpdate);
    await assert.rejects(updateWorkRecord(database, { ...selfUpdate, endedAtUtc: '2026-02-01T07:30:00.000Z' }), (error) =>
      error instanceof WorkRecordStorageError && error.code === 'OVERLAPPING_RECORD',
    );
    assert.deepEqual(await getWorkRecord(database, 'early'), selfUpdate);
  } finally { sqlite.close(); }
});

test('concurrent creates through one SQLite provider cannot both persist overlapping intervals', async () => {
  const { sqlite, database } = await setup();
  try {
    const first = manual('race-a', '2026-02-05T05:00:00.000Z', '2026-02-05T13:00:00.000Z');
    const second = manual('race-b', '2026-02-05T12:59:00.000Z', '2026-02-05T15:00:00.000Z');
    const results = await Promise.allSettled([
      createWorkRecord(database, first),
      createWorkRecord(database, second),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal((await listWorkRecords(database)).length, 1);
  } finally { sqlite.close(); }
});

test('planned snapshot survives schedule override, cycle deletion, and template deletion', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, template);
    await createShiftCycle(database, shiftCycle());
    const record = planned();
    await createWorkRecord(database, record);
    await createPlanOverride(database, 'cycle', { localDate: '2026-01-01', kind: 'OFF' });
    assert.deepEqual(await getWorkRecord(database, record.id), record);

    await deletePlanOverride(database, 'cycle', '2026-01-01');
    assert.equal(await deleteShiftCycle(database, 'cycle'), true);
    assert.equal(await deleteShiftTemplate(database, 'day'), true);
    assert.deepEqual(await getWorkRecord(database, record.id), {
      ...record,
      planned: { ...record.planned, cycleId: null, templateId: null },
    });
  } finally { sqlite.close(); }
});

test('editing a planned record cannot silently change its plan snapshot or timezone', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, template);
    await createShiftCycle(database, shiftCycle());
    const record = planned();
    await createWorkRecord(database, record);
    await assert.rejects(updateWorkRecord(database, {
      ...record,
      timezone: 'UTC',
      planned: { ...record.planned, templateName: 'Changed plan' },
    }), (error) => error instanceof WorkRecordStorageError && error.code === 'PLAN_LINK_IMMUTABLE');
    assert.deepEqual(await getWorkRecord(database, record.id), record);
  } finally { sqlite.close(); }
});

test('planned-cycle foreign key rejects a missing schedule and leaves no partial record', async () => {
  const { sqlite, database } = await setup();
  try {
    const missing = {
      ...planned(),
      planned: { ...planned().planned, cycleId: 'missing-cycle' },
    };
    await assert.rejects(createWorkRecord(database, missing));
    assert.equal(await getWorkRecord(database, missing.id), null);
  } finally { sqlite.close(); }
});

test('work records survive a cold SQLite close and reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-work-record-'));
  const path = join(directory, 'work-records.db');
  let sqlite = new DatabaseSync(path);
  try {
    let database = adapter(sqlite);
    await initializeDatabase(database);
    const record = manual('reopen', '2026-12-31T20:00:00.000Z', '2027-01-01T04:00:00.000Z', { breakMinutes: 30 });
    await createWorkRecord(database, record);
    sqlite.close();

    sqlite = new DatabaseSync(path);
    database = adapter(sqlite);
    await initializeDatabase(database);
    assert.deepEqual(await getWorkRecord(database, record.id), record);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('repository validation rejects breaks longer than the actual interval', async () => {
  const { sqlite, database } = await setup();
  try {
    const invalid = manual('bad-break', '2026-04-01T05:00:00.000Z', '2026-04-01T06:00:00.000Z', { breakMinutes: 61 });
    await assert.rejects(createWorkRecord(database, invalid), /Mola dakikası/);
    assert.equal(await getWorkRecord(database, invalid.id), null);
  } finally { sqlite.close(); }
});
