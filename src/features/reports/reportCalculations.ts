import type { DerivedDay } from '../../domain/payroll/types.ts';
import type { ShiftTemplate } from '../../domain/shift-cycle/index.ts';

// ── Shift kind classification ────────────────────────────────────────────────

export type ShiftTimeKind = 'day' | 'evening' | 'night';

/** Classify a shift start time into day / evening / night. */
export function classifyShiftKind(startLocalTime: string): ShiftTimeKind {
  const match = /^(\d{1,2}):/.exec(startLocalTime);
  if (!match) return 'day';
  const hour = Number(match[1]);
  if (hour >= 15 && hour < 19) return 'evening';
  if (hour >= 19 || hour < 6) return 'night';
  return 'day';
}

// ── Shift distribution ───────────────────────────────────────────────────────

export type ShiftDistribution = {
  day: number;
  evening: number;
  night: number;
  leave: number;
  holiday: number;
};

/**
 * Count days by shift kind for the given DerivedDay list.
 * Only counts days within the specified start..end range (inclusive).
 */
export function computeShiftDistribution(
  days: readonly DerivedDay[],
  templateMap: ReadonlyMap<string, Pick<ShiftTemplate, 'startLocalTime'>>,
  periodStart: string,
  periodEnd: string,
): ShiftDistribution {
  const dist: ShiftDistribution = { day: 0, evening: 0, night: 0, leave: 0, holiday: 0 };
  for (const d of days) {
    if (d.localDate < periodStart || d.localDate > periodEnd) continue;
    if (d.status === 'LEAVE') { dist.leave++; continue; }
    if (d.status === 'HOLIDAY' || d.isHoliday) { dist.holiday++; continue; }
    if (d.status === 'WORKED' && d.shiftTemplateId) {
      const tmpl = templateMap.get(d.shiftTemplateId);
      const kind = classifyShiftKind(tmpl?.startLocalTime ?? '08:00');
      dist[kind]++;
    }
  }
  return dist;
}

// ── Day-of-week overtime ─────────────────────────────────────────────────────

/** Mon=0 … Sun=6 */
export const DOW_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export type DowOvertimeEntry = { dow: number; label: string; totalMinutes: number };

/** Sum overtime minutes by day-of-week (Mon=0) across all supplied days. */
export function computeDayOfWeekOvertime(days: readonly DerivedDay[]): DowOvertimeEntry[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) {
    if ((d.overtimeMinutes ?? 0) <= 0) continue;
    const jsDay = dayOfWeek(d.localDate); // 0=Sun
    const monFirst = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
    totals[monFirst]! += d.overtimeMinutes;
  }
  return totals.map((totalMinutes, dow) => ({ dow, label: DOW_LABELS[dow]!, totalMinutes }));
}

/** Returns JS day-of-week (0=Sun) for a 'YYYY-MM-DD' string without timezone issues. */
function dayOfWeek(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

// ── Period delta ─────────────────────────────────────────────────────────────

/**
 * Returns % change as an integer (e.g. 5 for +5%, -10 for -10%).
 * Returns null when previous is 0 or null (can't divide by zero).
 */
export function computePeriodDelta(currentMinor: number, prevMinor: number | null): number | null {
  if (prevMinor === null || prevMinor === 0) return null;
  return Math.round(((currentMinor - prevMinor) / prevMinor) * 100);
}
