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
  getTimedBreaksForWorkRecord,
  getWorkRecord,
  getWorkRecordWithTimedBreaks,
  listWorkRecords,
  listWorkRecordsWithTimedBreaks,
  replaceTimedBreaksForWorkRecord,
  updateWorkRecord,
  WorkRecordStorageError,
} from '../../src/data/workRecordRepository.ts';
import { segmentStoredWorkRecord } from '../../src/data/workRecordSegmentation.ts';

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

test('timed breaks create, replace, clear and reload with the work record', async () => {
  const { sqlite, database } = await setup();
  const record = manual('timed-crud', '2026-10-28T07:00:00.000Z', '2026-10-28T15:00:00.000Z', { breakMinutes: 30 });
  const first = [{ id: 'break-a', startedAtUtc: '2026-10-28T09:00:00.000Z', endedAtUtc: '2026-10-28T09:10:00.000Z' },
    { id: 'break-b', startedAtUtc: '2026-10-28T10:00:00.000Z', endedAtUtc: '2026-10-28T10:20:00.000Z' }];
  try {
    await createWorkRecord(database, record, first);
    assert.deepEqual(await getTimedBreaksForWorkRecord(database, record.id), first.map((item) => ({ ...item, workRecordId: record.id })));
    const replacement = [{ id: 'break-c', startedAtUtc: '2026-10-28T11:30:00.000Z', endedAtUtc: '2026-10-28T12:00:00.000Z' }];
    await replaceTimedBreaksForWorkRecord(database, record.id, replacement);
    const loaded = await getWorkRecordWithTimedBreaks(database, record.id);
    assert.deepEqual(loaded, { record, timedBreaks: replacement.map((item) => ({ ...item, workRecordId: record.id })) });
    await replaceTimedBreaksForWorkRecord(database, record.id, []);
    assert.deepEqual(await getTimedBreaksForWorkRecord(database, record.id), []);
    assert.equal((await getWorkRecord(database, record.id)).breakMinutes, 30);
  } finally { sqlite.close(); }
});

test('timed-break repository rejects invalid, overlapping, out-of-range and total-mismatched intervals without changing stored breaks', async () => {
  const { sqlite, database } = await setup();
  const record = manual('timed-invalid', '2026-01-01T05:00:00.000Z', '2026-01-01T13:00:00.000Z', { breakMinutes: 30 });
  const valid = [{ id: 'break-valid', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:30:00.000Z' }];
  try {
    await createWorkRecord(database, record, valid);
    const invalidCases = [
      [{ id: 'bad-date', startedAtUtc: '2026-02-30T08:00:00.000Z', endedAtUtc: '2026-02-30T08:30:00.000Z' }],
      [{ id: 'outside', startedAtUtc: '2026-01-01T04:30:00.000Z', endedAtUtc: '2026-01-01T05:00:00.000Z' }],
      [{ id: 'zero', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:00:00.000Z' }],
      [{ id: 'short', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:29:00.000Z' }],
      [
        { id: 'overlap-a', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:20:00.000Z' },
        { id: 'overlap-b', startedAtUtc: '2026-01-01T08:19:00.000Z', endedAtUtc: '2026-01-01T08:29:00.000Z' },
      ],
    ];
    for (const intervals of invalidCases) {
      await assert.rejects(replaceTimedBreaksForWorkRecord(database, record.id, intervals));
      assert.deepEqual(await getTimedBreaksForWorkRecord(database, record.id), valid.map((item) => ({ ...item, workRecordId: record.id })));
    }
    await assert.rejects(replaceTimedBreaksForWorkRecord(database, record.id, [{
      id: 'offset', startedAtUtc: '2026-01-01T08:00:00+03:00', endedAtUtc: '2026-01-01T08:30:00+03:00',
    }]));
    const wide = manual('wide-date-check', '2026-02-01T00:00:00.000Z', '2026-03-31T23:59:00.000Z', { breakMinutes: 30 });
    await createWorkRecord(database, wide);
    assert.throws(() => sqlite.prepare(
      'INSERT INTO break_intervals (id, work_record_id, started_at_utc, ended_at_utc) VALUES (?, ?, ?, ?);',
    ).run('impossible-calendar-date', wide.id, '2026-02-30T08:00:00.000Z', '2026-02-30T08:30:00.000Z'), /CHECK constraint failed/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM break_intervals WHERE id = ?;').get('impossible-calendar-date').count, 0);
  } finally { sqlite.close(); }
});

test('updating a work interval or break total preserves timed-break integrity atomically', async () => {
  const { sqlite, database } = await setup();
  const record = manual('timed-update', '2026-01-01T05:00:00.000Z', '2026-01-01T13:00:00.000Z', { breakMinutes: 30 });
  const timed = [{ id: 'break-kept', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:30:00.000Z' }];
  try {
    await createWorkRecord(database, record, timed);
    assert.throws(() => sqlite.prepare('UPDATE work_records SET break_minutes = 45 WHERE id = ?;').run(record.id), /mismatch break total/);
    assert.throws(() => sqlite.prepare('UPDATE work_records SET ended_at_utc = ? WHERE id = ?;').run('2026-01-01T08:15:00.000Z', record.id), /exclude break interval/);
    assert.deepEqual(await getWorkRecord(database, record.id), record);
    await assert.rejects(updateWorkRecord(database, { ...record, endedAtUtc: '2026-01-01T08:15:00.000Z' }));
    await assert.rejects(updateWorkRecord(database, { ...record, breakMinutes: 45 }));
    assert.deepEqual(await getWorkRecord(database, record.id), record);
    assert.deepEqual(await getTimedBreaksForWorkRecord(database, record.id), timed.map((item) => ({ ...item, workRecordId: record.id })));

    const extended = { ...record, endedAtUtc: '2026-01-01T14:00:00.000Z', breakMinutes: 45 };
    const updatedBreaks = [{ id: 'break-new', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:45:00.000Z' }];
    await updateWorkRecord(database, extended, updatedBreaks);
    assert.deepEqual(await getWorkRecordWithTimedBreaks(database, record.id), {
      record: extended,
      timedBreaks: updatedBreaks.map((item) => ({ ...item, workRecordId: record.id })),
    });
  } finally { sqlite.close(); }
});

test('failed replacement rolls back its delete and concurrent writes serialize on one connection', async () => {
  const { sqlite, database } = await setup();
  const record = manual('rollback-break', '2026-01-01T05:00:00.000Z', '2026-01-01T13:00:00.000Z', { breakMinutes: 30 });
  const oldBreak = [{ id: 'break-old', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:30:00.000Z' }];
  try {
    await createWorkRecord(database, record, oldBreak);
    await createWorkRecord(database, manual('other-break-owner', '2026-01-02T05:00:00.000Z', '2026-01-02T13:00:00.000Z', { breakMinutes: 30 }), [
      { id: 'id-collision', startedAtUtc: '2026-01-02T08:00:00.000Z', endedAtUtc: '2026-01-02T08:30:00.000Z' },
    ]);
    await assert.rejects(replaceTimedBreaksForWorkRecord(database, record.id, [
      { id: 'id-collision', startedAtUtc: '2026-01-01T09:00:00.000Z', endedAtUtc: '2026-01-01T09:30:00.000Z' },
    ]));
    assert.deepEqual(await getTimedBreaksForWorkRecord(database, record.id), oldBreak.map((item) => ({ ...item, workRecordId: record.id })));

    const concurrent = [
      createWorkRecord(database, manual('concurrent-a', '2026-01-03T05:00:00.000Z', '2026-01-03T13:00:00.000Z')),
      createWorkRecord(database, manual('concurrent-b', '2026-01-03T05:00:00.000Z', '2026-01-03T13:00:00.000Z')),
    ];
    const results = await Promise.allSettled(concurrent);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    const listing = await listWorkRecordsWithTimedBreaks(database);
    assert.ok(listing.some(({ record: item }) => item.id === 'rollback-break'));
  } finally { sqlite.close(); }
});

test('timed-break rows survive a cold SQLite reopen and cascade only with their work record', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-v4-breaks-'));
  const path = join(directory, 'work.db');
  let sqlite = new DatabaseSync(path);
  let database = adapter(sqlite);
  const record = manual('reopen-break', '2026-10-28T07:00:00.000Z', '2026-10-28T15:00:00.000Z', { breakMinutes: 30 });
  const timed = [{ id: 'reopen-interval', startedAtUtc: '2026-10-28T09:45:00.000Z', endedAtUtc: '2026-10-28T10:15:00.000Z' }];
  try {
    await initializeDatabase(database);
    await createWorkRecord(database, record, timed);
    sqlite.close();
    sqlite = new DatabaseSync(path);
    database = adapter(sqlite);
    await initializeDatabase(database);
    assert.deepEqual(await getWorkRecordWithTimedBreaks(database, record.id), {
      record, timedBreaks: timed.map((item) => ({ ...item, workRecordId: record.id })),
    });
    const segmented = await segmentStoredWorkRecord(database, record.id, {
      boundaryWindows: [{ id: 'half-day', kind: 'HALF_DAY_HOLIDAY', startsAtUtc: '2026-10-28T10:00:00.000Z', endedAtUtc: '2026-10-28T13:00:00.000Z' }],
    });
    assert.equal(segmented.totalWorkedMinutes, 450);
    assert.deepEqual(segmented.segments.map(({ spanMinutes, boundaryIds }) => [spanMinutes, boundaryIds]), [[165, []], [165, ['half-day']], [120, []]]);
    await deleteWorkRecord(database, record.id);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM break_intervals WHERE work_record_id = ?;').get(record.id).count, 0);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy aggregate-only break records remain unknown and are never synthesized during segmentation', async () => {
  const { sqlite, database } = await setup();
  const record = manual('aggregate-only', '2026-10-28T07:00:00.000Z', '2026-10-28T15:00:00.000Z', { breakMinutes: 30 });
  try {
    await createWorkRecord(database, record);
    const stored = await getWorkRecordWithTimedBreaks(database, record.id);
    assert.deepEqual(stored.timedBreaks, []);
    assert.equal(stored.record.breakMinutes, 30);
    const segmented = await segmentStoredWorkRecord(database, record.id);
    assert.equal(segmented.breakTiming, 'AGGREGATE_ONLY');
    assert.equal(segmented.totalWorkedMinutes, 450);
    assert.ok(segmented.segments.every(({ workedMinutes }) => workedMinutes === null));
    assert.equal((await listWorkRecordsWithTimedBreaks(database))[0].timedBreaks.length, 0);
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
