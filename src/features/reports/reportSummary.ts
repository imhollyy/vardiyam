import type { ApprovedEarningsSnapshot } from '@/src/data/earningsRepository';
import type { WorkRecordWithTimedBreaks } from '@/src/data/workRecordRepository';
import type { WorkDayStatusEntry } from '@/src/data/workSessionRepository';
import type { PlannedShift, ShiftTemplate } from '@/src/domain/shift-cycle';

export type ReportRange = { start: string; endExclusive: string };
export type ReportSummary = {
  workedMinutes: number; unallocatedBreakMinutes: number; overtimeMinutes: number; extraHoursMinutes: number;
  durationDifferenceMinutes: number; completedDays: number; leaveDays: number;
  reportDays: number; absentDays: number; shiftDistribution: { name: string; minutes: number }[];
  approvedGrossMinor: number; approvedSnapshotCount: number;
};

function localDateAt(instantMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function minutesByLocalDate(startedAtUtc: string, endedAtUtc: string, timezone: string): Map<string, number> {
  let cursor = Date.parse(startedAtUtc);
  const end = Date.parse(endedAtUtc);
  const result = new Map<string, number>();
  while (cursor < end) {
    const date = localDateAt(cursor, timezone);
    // The next date transition is at most 36 real hours away, including DST changes.
    let low = cursor + 1;
    let high = Math.min(end, cursor + 36 * 60 * 60 * 1000);
    if (localDateAt(high, timezone) === date) high = end;
    else {
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (localDateAt(middle, timezone) === date) low = middle + 1;
        else high = middle;
      }
      high = low;
    }
    const minutes = (high - cursor) / 60_000;
    if (Number.isSafeInteger(minutes) && minutes > 0) result.set(date, (result.get(date) ?? 0) + minutes);
    cursor = high;
  }
  return result;
}
function shiftMinutes(template: ShiftTemplate): number {
  const [sh, sm] = template.startLocalTime.split(':').map(Number), [eh, em] = template.endLocalTime.split(':').map(Number);
  let value = eh * 60 + em - sh * 60 - sm;
  if (value <= 0) value += 1440;
  return value;
}

export function summarizeReports(input: {
  range: ReportRange; records: readonly WorkRecordWithTimedBreaks[]; statuses: readonly WorkDayStatusEntry[];
  plans: readonly PlannedShift[]; templates: readonly ShiftTemplate[]; snapshots: readonly ApprovedEarningsSnapshot[];
}): ReportSummary {
  const inRange = (date: string) => date >= input.range.start && date < input.range.endExclusive;
  const records = input.records;
  const elapsedByDate = new Map<string, number>();
  let workedMinutes = 0;
  let unallocatedBreakMinutes = 0;
  for (const item of records) {
    const startedAt = Date.parse(item.record.startedAtUtc);
    const endedAt = Date.parse(item.record.endedAtUtc);
    const elapsed = (endedAt - startedAt) / 60_000;
    if (!Number.isSafeInteger(elapsed) || elapsed <= 0) continue;
    const elapsedParts = minutesByLocalDate(item.record.startedAtUtc, item.record.endedAtUtc, item.record.timezone);
    const timedBreakParts = new Map<string, number>();
    let timedBreakMinutes = 0;
    for (const pause of item.timedBreaks) {
      const pauseMinutes = (Date.parse(pause.endedAtUtc) - Date.parse(pause.startedAtUtc)) / 60_000;
      if (!Number.isSafeInteger(pauseMinutes) || pauseMinutes <= 0) continue;
      timedBreakMinutes += pauseMinutes;
      for (const [date, minutes] of minutesByLocalDate(pause.startedAtUtc, pause.endedAtUtc, item.record.timezone)) {
        timedBreakParts.set(date, (timedBreakParts.get(date) ?? 0) + minutes);
      }
    }
    const unknownBreakMinutes = Math.max(0, item.record.breakMinutes - timedBreakMinutes);
    if ([...elapsedParts.keys()].some(inRange)) unallocatedBreakMinutes += unknownBreakMinutes;
    for (const [date, minutes] of elapsedParts) {
      if (!inRange(date)) continue;
      elapsedByDate.set(date, (elapsedByDate.get(date) ?? 0) + minutes);
      const netMinutes = minutes - (timedBreakParts.get(date) ?? 0);
      workedMinutes += netMinutes;
    }
  }
  let durationDifferenceMinutes = 0;
  const shiftDistribution = new Map<string, number>();
  for (const plan of input.plans) {
    if (!inRange(plan.localDate) || plan.kind !== 'SHIFT') continue;
    const template = input.templates.find((candidate) => candidate.id === plan.templateId);
    if (!template) continue;
    const planned = shiftMinutes(template);
    durationDifferenceMinutes += (elapsedByDate.get(plan.localDate) ?? 0) - planned;
    shiftDistribution.set(template.name, (shiftDistribution.get(template.name) ?? 0) + planned);
  }
  const latestLine = new Map<string, { createdAtUtc: string; kind: string | null; minutes: number; amountMinor: number | null }>();
  const countedSnapshots = new Set<string>();
  for (const saved of input.snapshots) {
    let used = false;
    for (const line of saved.result.snapshot?.lines ?? []) {
      if (!inRange(line.localDate)) continue;
      const previous = latestLine.get(line.id);
      if (!previous || saved.createdAtUtc > previous.createdAtUtc) latestLine.set(line.id, { createdAtUtc: saved.createdAtUtc, kind: line.selectedRuleKind, minutes: line.minutes, amountMinor: line.amountMinor });
      used = true;
    }
    if (used) countedSnapshots.add(saved.calculationId);
  }
  const lines = [...latestLine.values()];
  return {
    workedMinutes,
    overtimeMinutes: lines.filter((line) => line.kind === 'OVERTIME').reduce((sum, line) => sum + line.minutes, 0),
    extraHoursMinutes: lines.filter((line) => line.kind === 'EXTRA_HOURS').reduce((sum, line) => sum + line.minutes, 0),
    durationDifferenceMinutes,
    unallocatedBreakMinutes,
    completedDays: new Set([...elapsedByDate.keys()]).size,
    leaveDays: input.statuses.filter((item) => inRange(item.localDate) && item.status === 'LEAVE').length,
    reportDays: input.statuses.filter((item) => inRange(item.localDate) && item.status === 'SICK_REPORT').length,
    absentDays: input.statuses.filter((item) => inRange(item.localDate) && item.status === 'NOT_WORKED').length,
    shiftDistribution: [...shiftDistribution].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes),
    approvedGrossMinor: lines.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0),
    approvedSnapshotCount: countedSnapshots.size,
  };
}

export function canUseReportsReward(state: { lastUsedLocalDate: string | null; expiresAtUtc: string | null }, nowUtc: string, localDate: string): boolean {
  return state.lastUsedLocalDate !== localDate && !(state.expiresAtUtc && Date.parse(state.expiresAtUtc) > Date.parse(nowUtc));
}
