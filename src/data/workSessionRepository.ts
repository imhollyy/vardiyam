import type { SQLiteDatabase } from 'expo-sqlite';

import { dayOrdinal } from '../domain/shift-cycle/index.ts';
import { utcToLocalDateTime } from '../domain/work-record.ts';
import type { PlannedWorkSnapshot } from '@/src/domain/work-record';
import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type ActiveWorkSession = {
  id: 'active';
  startedAtUtc: string;
  startedLocalDate: string;
  timezone: string;
  planned: PlannedWorkSnapshot | null;
};

export type WorkDayStatus = 'LEAVE' | 'SICK_REPORT' | 'NOT_WORKED';
export type WorkDayStatusEntry = { localDate: string; status: WorkDayStatus; note: string | null; updatedAtUtc: string };

type SessionDatabase = Pick<SQLiteDatabase,
  'getFirstAsync' | 'getAllAsync' | 'runAsync' | 'withTransactionAsync'>;

type ActiveSessionRow = {
  id: 'active'; started_at_utc: string; started_local_date: string; timezone: string; planned_snapshot_json: string | null;
};

function fromSessionRow(row: ActiveSessionRow): ActiveWorkSession {
  let planned: PlannedWorkSnapshot | null = null;
  if (row.planned_snapshot_json !== null) {
    try { planned = JSON.parse(row.planned_snapshot_json) as PlannedWorkSnapshot; }
    catch { throw new Error('Açık mesai kaydının vardiya bilgisi okunamadı.'); }
    if (!planned || typeof planned !== 'object' || !planned.localDate || !planned.templateName || !planned.startLocalDateTime || !planned.endLocalDateTime) {
      throw new Error('Açık mesai kaydının vardiya bilgisi geçersiz.');
    }
  }
  return {
    id: 'active', startedAtUtc: row.started_at_utc, startedLocalDate: row.started_local_date,
    timezone: row.timezone, planned,
  };
}

function validateSession(input: Omit<ActiveWorkSession, 'id'>): void {
  const timestamp = Date.parse(input.startedAtUtc);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(input.startedAtUtc) ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== input.startedAtUtc) {
    throw new Error('Mesai başlangıcı dakika hassasiyetinde geçerli bir UTC zamanı olmalıdır.');
  }
  dayOrdinal(input.startedLocalDate);
  if (typeof input.timezone !== 'string' || !input.timezone.trim()) throw new Error('Geçerli bir zaman dilimi gerekli.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); }
  catch { throw new Error('Desteklenmeyen zaman dilimi.'); }
  if (utcToLocalDateTime(input.startedAtUtc, input.timezone).slice(0, 10) !== input.startedLocalDate) {
    throw new Error('Mesai başlangıç tarihi, seçilen zaman dilimindeki gerçek tarihle eşleşmiyor.');
  }
  if (input.planned && (input.planned.localDate !== input.startedLocalDate || !input.planned.templateName.trim())) {
    throw new Error('Başlangıç vardiyası oturum tarihiyle eşleşmiyor.');
  }
}

export async function getActiveWorkSession(database: SessionDatabase): Promise<ActiveWorkSession | null> {
  return withDatabaseOperation(database, async () => {
    const row = await database.getFirstAsync<ActiveSessionRow>(
      'SELECT id, started_at_utc, started_local_date, timezone, planned_snapshot_json FROM active_work_sessions WHERE id = \'active\';',
    );
    return row ? fromSessionRow(row) : null;
  });
}

export async function startActiveWorkSession(
  database: SessionDatabase,
  input: Omit<ActiveWorkSession, 'id'>,
): Promise<void> {
  validateSession(input);
  await withDatabaseTransaction(database, async () => {
    const existing = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM active_work_sessions WHERE id = 'active';",
    );
    if (existing) throw new Error('Zaten açık bir mesai var. Önce onu bitir.');
    const endProbe = new Date(Date.parse(input.startedAtUtc) + 60_000).toISOString();
    const overlap = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM work_records WHERE started_at_utc < ? AND ended_at_utc > ? LIMIT 1;',
      endProbe, input.startedAtUtc,
    );
    if (overlap) throw new Error('Bu saatte tamamlanmış bir çalışma kaydı var. Takvimden kontrol et.');
    await database.runAsync(
      `INSERT INTO active_work_sessions (id, started_at_utc, started_local_date, timezone, planned_snapshot_json)
       VALUES ('active', ?, ?, ?, ?);`,
      input.startedAtUtc,
      input.startedLocalDate,
      input.timezone,
      input.planned ? JSON.stringify(input.planned) : null,
    );
  });
}

export async function listWorkDayStatuses(
  database: SessionDatabase,
  fromLocalDate: string,
  toLocalDate: string,
): Promise<WorkDayStatusEntry[]> {
  dayOrdinal(fromLocalDate);
  dayOrdinal(toLocalDate);
  if (toLocalDate < fromLocalDate) throw new Error('Tarih aralığı ters olamaz.');
  return withDatabaseOperation(database, () => database.getAllAsync<{
    local_date: string; status: WorkDayStatus; note: string | null; updated_at_utc: string;
  }>(
    'SELECT local_date, status, note, updated_at_utc FROM work_day_statuses WHERE local_date >= ? AND local_date < ? ORDER BY local_date;',
    fromLocalDate, toLocalDate,
  ).then((rows) => rows.map((row) => ({
    localDate: row.local_date, status: row.status, note: row.note, updatedAtUtc: row.updated_at_utc,
  }))));
}

export async function saveWorkDayStatus(
  database: SessionDatabase,
  input: { localDate: string; status: WorkDayStatus; note: string | null; updatedAtUtc: string },
): Promise<void> {
  dayOrdinal(input.localDate);
  if (!['LEAVE', 'SICK_REPORT', 'NOT_WORKED'].includes(input.status) ||
      (input.note !== null && (typeof input.note !== 'string' || input.note.length > 2000)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(input.updatedAtUtc) ||
      !Number.isFinite(Date.parse(input.updatedAtUtc)) || new Date(Date.parse(input.updatedAtUtc)).toISOString() !== input.updatedAtUtc) {
    throw new Error('Gün durumu veya not geçersiz.');
  }
  await withDatabaseTransaction(database, async () => {
    await database.runAsync(
      `INSERT INTO work_day_statuses (local_date, status, note, updated_at_utc) VALUES (?, ?, ?, ?)
       ON CONFLICT(local_date) DO UPDATE SET status=excluded.status, note=excluded.note, updated_at_utc=excluded.updated_at_utc;`,
      input.localDate, input.status, input.note, input.updatedAtUtc,
    );
  });
}

export async function deleteWorkDayStatus(database: SessionDatabase, localDate: string): Promise<void> {
  dayOrdinal(localDate);
  await withDatabaseTransaction(database, async () => {
    await database.runAsync('DELETE FROM work_day_statuses WHERE local_date = ?;', localDate);
  });
}
