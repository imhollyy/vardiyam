import type { SQLiteDatabase } from 'expo-sqlite';

import { validateWorkRecord, type PlannedWorkSnapshot, type WorkRecord } from '../domain/work-record.ts';
import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

type WorkRecordDatabase = Pick<
  SQLiteDatabase,
  'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'
>;

export type WorkRecordStorageErrorCode =
  | 'DATABASE_NOT_INITIALIZED'
  | 'DATABASE_INTEGRITY_ERROR'
  | 'NOT_FOUND'
  | 'OVERLAPPING_RECORD'
  | 'PLAN_LINK_IMMUTABLE';

export class WorkRecordStorageError extends Error {
  readonly code: WorkRecordStorageErrorCode;

  constructor(code: WorkRecordStorageErrorCode, message: string) {
    super(message);
    this.name = 'WorkRecordStorageError';
    this.code = code;
  }
}

type WorkRecordRow = {
  id: string;
  record_source: 'MANUAL' | 'PLANNED';
  started_at_utc: string;
  ended_at_utc: string;
  timezone: string;
  break_minutes: number;
  note: string | null;
  planned_cycle_id: string | null;
  planned_local_date: string | null;
  planned_template_id: string | null;
  planned_template_name: string | null;
  planned_start_local_datetime: string | null;
  planned_end_local_datetime: string | null;
};

const SELECT_COLUMNS =
  'id, record_source, started_at_utc, ended_at_utc, timezone, break_minutes, note, ' +
  'planned_cycle_id, planned_local_date, planned_template_id, planned_template_name, ' +
  'planned_start_local_datetime, planned_end_local_datetime';

async function assertForeignKeysEnabled(database: WorkRecordDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  if (!row || row.foreign_keys !== 1) {
    throw new WorkRecordStorageError(
      'DATABASE_NOT_INITIALIZED',
      'Initialize the app database before using work-record storage.',
    );
  }
}

function fromRow(row: WorkRecordRow): WorkRecord {
  let planned: PlannedWorkSnapshot | null = null;
  if (row.record_source === 'PLANNED') {
    if (
      row.planned_local_date === null || row.planned_template_name === null ||
      row.planned_start_local_datetime === null || row.planned_end_local_datetime === null
    ) {
      throw new WorkRecordStorageError('DATABASE_INTEGRITY_ERROR', 'Stored planned work record is missing its plan snapshot.');
    }
    planned = {
      cycleId: row.planned_cycle_id,
      localDate: row.planned_local_date,
      templateId: row.planned_template_id,
      templateName: row.planned_template_name,
      startLocalDateTime: row.planned_start_local_datetime,
      endLocalDateTime: row.planned_end_local_datetime,
    };
  } else if (
    row.planned_local_date !== null || row.planned_template_id !== null || row.planned_template_name !== null ||
    row.planned_start_local_datetime !== null || row.planned_end_local_datetime !== null
  ) {
    throw new WorkRecordStorageError('DATABASE_INTEGRITY_ERROR', 'Stored manual work record unexpectedly has a plan snapshot.');
  }

  const record: WorkRecord = {
    id: row.id,
    source: row.record_source,
    startedAtUtc: row.started_at_utc,
    endedAtUtc: row.ended_at_utc,
    timezone: row.timezone,
    breakMinutes: row.break_minutes,
    note: row.note,
    planned,
  };
  try {
    validateWorkRecord(record);
  } catch {
    throw new WorkRecordStorageError('DATABASE_INTEGRITY_ERROR', 'Stored work record failed domain validation.');
  }
  return record;
}

async function getInternal(database: WorkRecordDatabase, id: string): Promise<WorkRecord | null> {
  const row = await database.getFirstAsync<WorkRecordRow>(
    `SELECT ${SELECT_COLUMNS} FROM work_records WHERE id = ?;`,
    id,
  );
  return row ? fromRow(row) : null;
}

async function findOverlap(database: WorkRecordDatabase, record: WorkRecord, excludingId?: string): Promise<string | null> {
  const row = excludingId === undefined
    ? await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM work_records WHERE started_at_utc < ? AND ended_at_utc > ? LIMIT 1;',
        record.endedAtUtc,
        record.startedAtUtc,
      )
    : await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM work_records WHERE started_at_utc < ? AND ended_at_utc > ? AND id <> ? LIMIT 1;',
        record.endedAtUtc,
        record.startedAtUtc,
        excludingId,
      );
  return row?.id ?? null;
}

function assertNoOverlap(overlapId: string | null): void {
  if (overlapId) {
    throw new WorkRecordStorageError(
      'OVERLAPPING_RECORD',
      'Bu zaman aralığı başka bir fiilî çalışma kaydıyla çakışıyor. Var olan kayıt değiştirilmedi.',
    );
  }
}

function snapshotKey(record: WorkRecord): string {
  return JSON.stringify({ source: record.source, timezone: record.timezone, planned: record.planned });
}

async function insertInternal(database: WorkRecordDatabase, record: WorkRecord): Promise<void> {
  await database.runAsync(
    'INSERT INTO work_records (' + SELECT_COLUMNS + ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
    record.id,
    record.source,
    record.startedAtUtc,
    record.endedAtUtc,
    record.timezone,
    record.breakMinutes,
    record.note,
    record.planned?.cycleId ?? null,
    record.planned?.localDate ?? null,
    record.planned?.templateId ?? null,
    record.planned?.templateName ?? null,
    record.planned?.startLocalDateTime ?? null,
    record.planned?.endLocalDateTime ?? null,
  );
}

export async function createWorkRecord(database: WorkRecordDatabase, record: WorkRecord): Promise<void> {
  validateWorkRecord(record);
  if (record.source === 'PLANNED' && (!record.planned?.cycleId || !record.planned.templateId)) {
    throw new Error('Yeni plan bağlantısı için kayıtlı vardiya düzeni gerekir.');
  }

  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    assertNoOverlap(await findOverlap(database, record));
    await insertInternal(database, record);
  });
}

export async function updateWorkRecord(database: WorkRecordDatabase, record: WorkRecord): Promise<void> {
  validateWorkRecord(record);
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const existing = await getInternal(database, record.id);
    if (!existing) throw new WorkRecordStorageError('NOT_FOUND', 'Work record was not found.');
    if (snapshotKey(existing) !== snapshotKey(record)) {
      throw new WorkRecordStorageError(
        'PLAN_LINK_IMMUTABLE',
        'Kayıt kaynağı, zaman dilimi ve plan anlık görüntüsü düzenleme sırasında değiştirilemez.',
      );
    }
    assertNoOverlap(await findOverlap(database, record, record.id));
    await database.runAsync(
      'UPDATE work_records SET started_at_utc = ?, ended_at_utc = ?, break_minutes = ?, note = ? WHERE id = ?;',
      record.startedAtUtc,
      record.endedAtUtc,
      record.breakMinutes,
      record.note,
      record.id,
    );
  });
}

export async function getWorkRecord(database: WorkRecordDatabase, id: string): Promise<WorkRecord | null> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    return getInternal(database, id);
  });
}

export async function listWorkRecords(database: WorkRecordDatabase, limit = 5000): Promise<WorkRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error('Work-record history limit must be an integer from 1 to 5000.');
  }
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const rows = await database.getAllAsync<WorkRecordRow>(
      `SELECT ${SELECT_COLUMNS} FROM work_records ORDER BY started_at_utc DESC, id DESC LIMIT ?;`,
      limit,
    );
    return rows.map(fromRow);
  });
}

export async function deleteWorkRecord(database: WorkRecordDatabase, id: string): Promise<boolean> {
  return withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const result = await database.runAsync('DELETE FROM work_records WHERE id = ?;', id);
    return result.changes === 1;
  });
}
