import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettings } from '../../data/settingsRepository.ts';
import { getDayEntriesInRange } from '../../data/dayEntryRepository.ts';
import { getAllExtraIncomes } from '../../data/extraIncomeRepository.ts';
import { listShiftTemplates } from '../../data/shiftCycleRepository.ts';
import { generateMonthlyStatement, getPayPeriodForDate, type MonthlyStatement } from '../../domain/payroll/index.ts';

export type PeriodInfo = { start: string; end: string; label: string };

export async function loadPeriodStatement(
  database: SQLiteDatabase,
  period: PeriodInfo,
  cumulativeTaxableMinor = 0,
): Promise<MonthlyStatement> {
  const settings = await getSettings(database);
  const templates = await listShiftTemplates(database);
  const extras = await getAllExtraIncomes(database);

  // Fetch a wider range to include partial weeks at the period boundaries
  const rangeStart = expandWeekStart(period.start);
  const rangeEnd = expandWeekEnd(period.end);
  const entries = await getDayEntriesInRange(database, rangeStart, rangeEnd);

  const year = Number(period.end.split('-')[0]);
  const month = Number(period.end.split('-')[1]);
  return generateMonthlyStatement(settings, entries, extras, year, month, cumulativeTaxableMinor, templates);
}

export async function loadCurrentPeriodStatement(
  database: SQLiteDatabase,
  today: string,
  cumulativeTaxableMinor = 0,
): Promise<{ statement: MonthlyStatement; period: PeriodInfo }> {
  const settings = await getSettings(database);
  const period = getPayPeriodForDate(today, settings.payday);
  const statement = await loadPeriodStatement(database, period, cumulativeTaxableMinor);
  return { statement, period };
}

/** Extend start back to Monday of the containing week. */
function expandWeekStart(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(y, m - 1, d + diff);
  return formatDate(monday);
}

/** Extend end forward to Sunday of the containing week. */
function expandWeekEnd(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? 0 : 7 - dow;
  const sunday = new Date(y, m - 1, d + diff);
  return formatDate(sunday);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
