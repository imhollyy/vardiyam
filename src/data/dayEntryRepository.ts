import type { SQLiteDatabase } from 'expo-sqlite';

import type { DayEntry, LeaveType } from '../domain/payroll/types.ts';

type DayEntryRow = {
  local_date: string;
  shift_override_id: string | null;
  overtime_minutes: number;
  late_early_minutes: number;
  leave_type: string | null;
  leave_half_day: number;
  leave_hours: number;
  deduct_override: number | null;
  note: string | null;
};

function rowToEntry(row: DayEntryRow): DayEntry {
  return {
    localDate: row.local_date,
    shiftOverrideId: row.shift_override_id,
    overtimeMinutes: row.overtime_minutes,
    lateEarlyMinutes: row.late_early_minutes,
    leaveType: row.leave_type as LeaveType | null,
    leaveHalfDay: row.leave_half_day === 1,
    leaveHours: row.leave_hours,
    deductOverride: row.deduct_override === null ? null : row.deduct_override === 1,
    note: row.note,
  };
}

export async function getDayEntry(database: SQLiteDatabase, localDate: string): Promise<DayEntry | null> {
  const row = await database.getFirstAsync<DayEntryRow>(
    'SELECT * FROM day_entries WHERE local_date = ?;',
    localDate,
  );
  return row ? rowToEntry(row) : null;
}

export async function getDayEntriesInRange(
  database: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<Map<string, DayEntry>> {
  const rows = await database.getAllAsync<DayEntryRow>(
    'SELECT * FROM day_entries WHERE local_date BETWEEN ? AND ? ORDER BY local_date;',
    startDate,
    endDate,
  );
  const map = new Map<string, DayEntry>();
  for (const row of rows) {
    map.set(row.local_date, rowToEntry(row));
  }
  return map;
}

export type DayEntryPatch = {
  shiftOverrideId?: string | null;
  overtimeMinutes?: number;
  lateEarlyMinutes?: number;
  leaveType?: LeaveType | null;
  leaveHalfDay?: boolean;
  leaveHours?: number;
  deductOverride?: boolean | null;
  note?: string | null;
};

export async function upsertDayEntry(
  database: SQLiteDatabase,
  localDate: string,
  patch: DayEntryPatch,
): Promise<void> {
  const existing = await getDayEntry(database, localDate);

  if (existing) {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.shiftOverrideId !== undefined) { sets.push('shift_override_id = ?'); values.push(patch.shiftOverrideId); }
    if (patch.overtimeMinutes !== undefined) { sets.push('overtime_minutes = ?'); values.push(patch.overtimeMinutes); }
    if (patch.lateEarlyMinutes !== undefined) { sets.push('late_early_minutes = ?'); values.push(patch.lateEarlyMinutes); }
    if (patch.leaveType !== undefined) { sets.push('leave_type = ?'); values.push(patch.leaveType); }
    if (patch.leaveHalfDay !== undefined) { sets.push('leave_half_day = ?'); values.push(patch.leaveHalfDay ? 1 : 0); }
    if (patch.leaveHours !== undefined) { sets.push('leave_hours = ?'); values.push(patch.leaveHours); }
    if (patch.deductOverride !== undefined) { sets.push('deduct_override = ?'); values.push(patch.deductOverride === null ? null : patch.deductOverride ? 1 : 0); }
    if (patch.note !== undefined) { sets.push('note = ?'); values.push(patch.note); }
    if (sets.length === 0) return;
    await database.runAsync(`UPDATE day_entries SET ${sets.join(', ')} WHERE local_date = ?;`, [...values, localDate] as (string | number | null)[]);
  } else {
    await database.runAsync(
      `INSERT INTO day_entries (local_date, shift_override_id, overtime_minutes, late_early_minutes, leave_type, leave_half_day, leave_hours, deduct_override, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        localDate,
        patch.shiftOverrideId ?? null,
        patch.overtimeMinutes ?? 0,
        patch.lateEarlyMinutes ?? 0,
        patch.leaveType ?? null,
        patch.leaveHalfDay ? 1 : 0,
        patch.leaveHours ?? 0,
        patch.deductOverride === undefined || patch.deductOverride === null ? null : patch.deductOverride ? 1 : 0,
        patch.note ?? null,
      ],
    );
  }
}

export async function deleteDayEntry(database: SQLiteDatabase, localDate: string): Promise<void> {
  await database.runAsync('DELETE FROM day_entries WHERE local_date = ?;', localDate);
}
