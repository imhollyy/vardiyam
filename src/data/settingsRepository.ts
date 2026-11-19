import type { SQLiteDatabase } from 'expo-sqlite';

import type { Settings, SalaryType, WorkSchedule, ShiftPattern } from '../domain/payroll/types.ts';

type SettingsRow = {
  salary_minor: number;
  salary_type: string;
  payday: string;
  bes_enabled: number;
  bes_rate_bp: number;
  work_schedule: string;
  shift_pattern: string;
  start_date: string | null;
  setup_completed: number;
};

function rowToSettings(row: SettingsRow): Settings {
  return {
    salaryMinor: row.salary_minor,
    salaryType: row.salary_type as SalaryType,
    payday: row.payday,
    besEnabled: row.bes_enabled === 1,
    besRateBp: row.bes_rate_bp,
    workSchedule: row.work_schedule as WorkSchedule,
    shiftPattern: row.shift_pattern as ShiftPattern,
    startDate: row.start_date,
    setupCompleted: row.setup_completed === 1,
  };
}

export async function getSettings(database: SQLiteDatabase): Promise<Settings> {
  const row = await database.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = 1;');
  if (!row) throw new Error('Ayarlar bulunamadı.');
  return rowToSettings(row);
}

export async function updateSettings(database: SQLiteDatabase, patch: Partial<Settings>): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.salaryMinor !== undefined) { sets.push('salary_minor = ?'); values.push(patch.salaryMinor); }
  if (patch.salaryType !== undefined) { sets.push('salary_type = ?'); values.push(patch.salaryType); }
  if (patch.payday !== undefined) { sets.push('payday = ?'); values.push(patch.payday); }
  if (patch.besEnabled !== undefined) { sets.push('bes_enabled = ?'); values.push(patch.besEnabled ? 1 : 0); }
  if (patch.besRateBp !== undefined) { sets.push('bes_rate_bp = ?'); values.push(patch.besRateBp); }
  if (patch.workSchedule !== undefined) { sets.push('work_schedule = ?'); values.push(patch.workSchedule); }
  if (patch.shiftPattern !== undefined) { sets.push('shift_pattern = ?'); values.push(patch.shiftPattern); }
  if (patch.startDate !== undefined) { sets.push('start_date = ?'); values.push(patch.startDate); }
  if (patch.setupCompleted !== undefined) { sets.push('setup_completed = ?'); values.push(patch.setupCompleted ? 1 : 0); }

  if (sets.length === 0) return;
  await database.runAsync(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1;`, values as (string | number | null)[]);
}

export async function markSetupCompleted(database: SQLiteDatabase): Promise<void> {
  await database.runAsync('UPDATE settings SET setup_completed = 1 WHERE id = 1;');
}
