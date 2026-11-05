import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { createShiftCycle, createShiftTemplate, deleteShiftCycle, deleteShiftTemplate } from '../../src/data/shiftCycleRepository.ts';
import { deleteWorkDayStatus, getActiveWorkSession, listWorkDayStatuses, saveWorkDayStatus, startActiveWorkSession } from '../../src/data/workSessionRepository.ts';
import { completeActiveWorkSessionWithRecord } from '../../src/data/workRecordRepository.ts';

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

test('active work session persists and completes atomically into a WorkRecord', async () => {
  const { sqlite, database } = await setup();
  try {
    const session = { startedAtUtc: '2026-11-05T05:00:00.000Z', startedLocalDate: '2026-11-05', timezone: 'Europe/Istanbul', planned: null };
    await startActiveWorkSession(database, session);
    assert.deepEqual(await getActiveWorkSession(database), { id: 'active', ...session });
    await assert.rejects(startActiveWorkSession(database, session), /Zaten açık bir mesai/);
    const record = {
      id: 'clock-synthetic', source: 'MANUAL', startedAtUtc: session.startedAtUtc, endedAtUtc: '2026-11-05T06:00:00.000Z',
      timezone: session.timezone, breakMinutes: 0, note: null, planned: null,
    };
    await completeActiveWorkSessionWithRecord(database, record);
    assert.equal(await getActiveWorkSession(database), null);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, started_at_utc, ended_at_utc FROM work_records WHERE id = ?;').get(record.id) }, {
      id: record.id, started_at_utc: record.startedAtUtc, ended_at_utc: record.endedAtUtc,
    });
  } finally { sqlite.close(); }
});

test('session completion failure preserves the active start for retry', async () => {
  const { sqlite, database } = await setup();
  try {
    const session = { startedAtUtc: '2026-11-05T05:00:00.000Z', startedLocalDate: '2026-11-05', timezone: 'Europe/Istanbul', planned: null };
    await startActiveWorkSession(database, session);
    const invalid = { id: 'clock-invalid', source: 'MANUAL', startedAtUtc: session.startedAtUtc, endedAtUtc: session.startedAtUtc,
      timezone: session.timezone, breakMinutes: 0, note: null, planned: null };
    await assert.rejects(completeActiveWorkSessionWithRecord(database, invalid));
    assert.deepEqual(await getActiveWorkSession(database), { id: 'active', ...session });
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM work_records;').get().count, 0);
  } finally { sqlite.close(); }
});

test('day annotations persist locally and can be cleared without becoming work records', async () => {
  const { sqlite, database } = await setup();
  try {
    const entry = { localDate: '2026-11-05', status: 'SICK_REPORT', note: 'synthetic note', updatedAtUtc: '2026-11-05T05:00:00.000Z' };
    await saveWorkDayStatus(database, entry);
    assert.deepEqual(await listWorkDayStatuses(database, '2026-11-01', '2026-12-01'), [entry]);
    assert.throws(() => sqlite.prepare('INSERT INTO work_day_statuses(local_date,status,updated_at_utc) VALUES(?,?,?);').run(
      '2026-02-30', 'LEAVE', '2026-11-05T05:00:00.000Z'), /CHECK constraint failed/);
    await deleteWorkDayStatus(database, entry.localDate);
    assert.deepEqual(await listWorkDayStatuses(database, '2026-11-01', '2026-12-01'), []);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM work_records;').get().count, 0);
  } finally { sqlite.close(); }
});

test('active session local date must match its real zoned UTC instant', async () => {
  const { sqlite, database } = await setup();
  try {
    await assert.rejects(startActiveWorkSession(database, {
      startedAtUtc: '2026-11-05T05:00:00.000Z', startedLocalDate: '2026-11-04', timezone: 'Europe/Istanbul', planned: null,
    }), /gerçek tarihle eşleşmiyor/);
    assert.equal(await getActiveWorkSession(database), null);
  } finally { sqlite.close(); }
});

test('planned session finishes after its cycle and template are deleted while keeping the historical plan snapshot', async () => {
  const { sqlite, database } = await setup();
  try {
    await createShiftTemplate(database, { id: 'session-template', code: 'S', name: 'Synthetic shift', startLocalTime: '08:00', endLocalTime: '16:00' });
    await createShiftCycle(database, {
      id: 'session-cycle', name: 'Synthetic cycle', timezone: 'Europe/Istanbul', anchorLocalDate: '2026-11-05', startIndex: 0,
      entries: [{ kind: 'SHIFT', templateId: 'session-template' }],
    });
    const planned = {
      cycleId: 'session-cycle', localDate: '2026-11-05', templateId: 'session-template', templateName: 'Synthetic shift',
      startLocalDateTime: '2026-11-05T08:00', endLocalDateTime: '2026-11-05T16:00',
    };
    const session = { startedAtUtc: '2026-11-05T05:00:00.000Z', startedLocalDate: '2026-11-05', timezone: 'Europe/Istanbul', planned };
    await startActiveWorkSession(database, session);
    assert.equal(await deleteShiftCycle(database, 'session-cycle'), true);
    assert.equal(await deleteShiftTemplate(database, 'session-template'), true);

    const record = { id: 'clock-planned', source: 'PLANNED', startedAtUtc: session.startedAtUtc, endedAtUtc: '2026-11-05T13:00:00.000Z',
      timezone: session.timezone, breakMinutes: 0, note: null, planned };
    await completeActiveWorkSessionWithRecord(database, record);
    assert.equal(await getActiveWorkSession(database), null);
    assert.deepEqual({ ...sqlite.prepare('SELECT record_source, planned_cycle_id, planned_template_id, planned_template_name, planned_start_local_datetime FROM work_records WHERE id=?;').get(record.id) }, {
      record_source: 'PLANNED', planned_cycle_id: null, planned_template_id: null,
      planned_template_name: 'Synthetic shift', planned_start_local_datetime: '2026-11-05T08:00',
    });
  } finally { sqlite.close(); }
});
