import { addCalendarDays } from './shift-cycle/index.ts';

export type TimedBreakInterval = {
  startedAtUtc: string;
  endedAtUtc: string;
};

/** Caller-provided source windows create cuts/markers; the engine does not infer law or pay policy. */
export type SegmentationBoundaryKind =
  | 'PUBLIC_HOLIDAY'
  | 'HALF_DAY_HOLIDAY'
  | 'WORKPLACE_RULE_CHANGE'
  | 'CUSTOM';

export type SegmentationBoundaryWindow = {
  id: string;
  kind: SegmentationBoundaryKind;
  startsAtUtc: string;
  endedAtUtc: string;
};

export type SegmentableWorkRecord = {
  startedAtUtc: string;
  endedAtUtc: string;
  timezone: string;
  /** Existing VDY-004 aggregate only; the engine never guesses its placement. */
  breakMinutes: number;
};

export type WorkSegmentationOptions = {
  /** Sunday = 0 through Saturday = 6. Default: Monday (1). */
  weekStartsOn?: number;
  /** Calendar day on which each configured monthly pay period begins. Default: 1. */
  payrollPeriodStartDay?: number;
  /** Explicitly timed breaks supplied by a future input/data flow; not persisted by VDY-004. */
  breakIntervals?: readonly TimedBreakInterval[];
  /** Caller-sourced holiday/rule windows; overlap is allowed and minute spans are still emitted once. */
  boundaryWindows?: readonly SegmentationBoundaryWindow[];
};

export type WorkSegment = {
  startedAtUtc: string;
  endedAtUtc: string;
  /** Elapsed UTC minutes in this emitted interval. With unknown breaks this is a span, not proven work. */
  spanMinutes: number;
  /** Null when an aggregate break could belong to more than one segment. */
  workedMinutes: number | null;
  localDate: string;
  weekStartLocalDate: string;
  calendarMonth: string;
  calendarYear: number;
  payrollPeriodStartDate: string;
  boundaryIds: string[];
  boundaryKinds: SegmentationBoundaryKind[];
};

export type WorkSegmentationResult = {
  timezone: string;
  totalSpanMinutes: number;
  totalBreakMinutes: number;
  /** Aggregate total is exact even when its per-segment/category allocation is unknown. */
  totalWorkedMinutes: number;
  breakTiming: 'NONE' | 'TIMED' | 'AGGREGATE_ONLY';
  unallocatedBreakMinutes: number;
  segments: WorkSegment[];
};

export type WorkSegmentationErrorCode =
  | 'INVALID_INSTANT'
  | 'INVALID_RANGE'
  | 'INVALID_TIMEZONE'
  | 'INVALID_BREAK'
  | 'BREAK_OUTSIDE_RECORD'
  | 'OVERLAPPING_BREAKS'
  | 'BREAK_TOTAL_MISMATCH'
  | 'INVALID_BOUNDARY'
  | 'INVALID_PERIOD_SETTINGS'
  | 'RANGE_TOO_LARGE';

export class WorkSegmentationError extends Error {
  readonly code: WorkSegmentationErrorCode;

  constructor(code: WorkSegmentationErrorCode, message: string) {
    super(message);
    this.name = 'WorkSegmentationError';
    this.code = code;
  }
}

const MINUTE_MS = 60_000;
const SIX_HOURS_MS = 6 * 60 * MINUTE_MS;
const MAX_RECORD_MINUTES = 3_660 * 24 * 60;
const MAX_BOUNDARY_WINDOWS = 2_000;
const MAX_SEGMENTS = 10_000;
const CANONICAL_UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/;

function fail(code: WorkSegmentationErrorCode, message: string): never {
  throw new WorkSegmentationError(code, message);
}

function parseInstant(value: unknown): number {
  if (typeof value !== 'string' || !CANONICAL_UTC_MINUTE.test(value)) {
    return fail('INVALID_INSTANT', 'Zamanlar dakika hassasiyetinde kanonik UTC ISO anları olmalıdır.');
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value || instant % MINUTE_MS !== 0) {
    return fail('INVALID_INSTANT', 'UTC zaman anı geçerli bir takvim tarihi ve dakika sınırında olmalıdır.');
  }
  return instant;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return fail('INVALID_TIMEZONE', 'Geçerli bir IANA zaman dilimi girilmelidir.');
  }
  try {
    return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    return fail('INVALID_TIMEZONE', 'Geçerli bir IANA zaman dilimi girilmelidir.');
  }
}

function localDateAt(formatter: Intl.DateTimeFormat, instant: number): string {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function weekday(localDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return fail('INVALID_INSTANT', 'Zaman diliminden geçerli yerel tarih üretilemedi.');
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(12, 0, 0, 0);
  if (!Number.isFinite(date.getTime())) return fail('INVALID_INSTANT', 'Yerel tarih desteklenen aralığın dışında.');
  return date.getUTCDay();
}

function daysInGregorianMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function periodStartDate(localDate: string, startDay: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const thisMonthStart = Math.min(startDay, daysInGregorianMonth(year, month));
  if (day >= thisMonthStart) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(thisMonthStart).padStart(2, '0')}`;
  }

  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousStart = Math.min(startDay, daysInGregorianMonth(previousYear, previousMonth));
  return `${String(previousYear).padStart(4, '0')}-${String(previousMonth).padStart(2, '0')}-${String(previousStart).padStart(2, '0')}`;
}

/**
 * Finds local-date changes on the UTC minute grid. Six-hour probes keep long records bounded;
 * IANA timezone date transitions cannot change twice inside a probe window. Binary search locates
 * the first changed local minute, including DST gaps/folds and historical offset jumps.
 */
function addLocalDateCuts(
  cuts: Set<number>,
  start: number,
  end: number,
  formatter: Intl.DateTimeFormat,
): void {
  let cursor = start;
  while (cursor < end) {
    const startLocalDate = localDateAt(formatter, cursor);
    const probe = Math.min(cursor + SIX_HOURS_MS, end);
    if (localDateAt(formatter, probe) === startLocalDate) {
      cursor = probe;
      continue;
    }

    let sameDateMinute = cursor;
    let changedDateMinute = probe;
    while (changedDateMinute - sameDateMinute > MINUTE_MS) {
      const middleMinutes = Math.floor((changedDateMinute - sameDateMinute) / (2 * MINUTE_MS));
      const middle = sameDateMinute + Math.max(1, middleMinutes) * MINUTE_MS;
      if (localDateAt(formatter, middle) === startLocalDate) sameDateMinute = middle;
      else changedDateMinute = middle;
    }
    cuts.add(changedDateMinute);
    cursor = changedDateMinute;
  }
}

function normalizeBreaks(
  intervals: readonly TimedBreakInterval[] | undefined,
  start: number,
  end: number,
  totalBreakMinutes: number,
): { known: boolean; intervals: { start: number; end: number }[] } {
  if (intervals === undefined) return { known: totalBreakMinutes === 0, intervals: [] };

  const parsed = intervals.map((interval) => ({
    start: parseInstant(interval?.startedAtUtc),
    end: parseInstant(interval?.endedAtUtc),
  })).sort((left, right) => left.start - right.start);
  let total = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    const interval = parsed[index];
    if (interval.end <= interval.start) return fail('INVALID_BREAK', 'Mola aralığı başlangıçtan sonra bitmelidir.');
    if (interval.start < start || interval.end > end) return fail('BREAK_OUTSIDE_RECORD', 'Mola aralığı fiilî çalışma aralığının içinde olmalıdır.');
    if (index > 0 && interval.start < parsed[index - 1].end) {
      return fail('OVERLAPPING_BREAKS', 'Mola aralıkları çakışamaz; bitişik molalara izin verilir.');
    }
    total += (interval.end - interval.start) / MINUTE_MS;
  }
  if (total !== totalBreakMinutes) {
    return fail('BREAK_TOTAL_MISMATCH', 'Zamanı bilinen mola aralıklarının toplamı WorkRecord mola dakikasıyla eşleşmelidir.');
  }
  return { known: true, intervals: parsed };
}

function normalizeBoundaryWindows(
  windows: readonly SegmentationBoundaryWindow[] | undefined,
): (SegmentationBoundaryWindow & { start: number; end: number })[] {
  if (!windows) return [];
  if (windows.length > MAX_BOUNDARY_WINDOWS) return fail('RANGE_TOO_LARGE', 'Bir kayıtta en fazla 2000 kesme penceresi kullanılabilir.');
  const ids = new Set<string>();
  return windows.map((window) => {
    if (!window || typeof window.id !== 'string' || !window.id.trim() || ids.has(window.id) ||
        !['PUBLIC_HOLIDAY', 'HALF_DAY_HOLIDAY', 'WORKPLACE_RULE_CHANGE', 'CUSTOM'].includes(window.kind)) {
      return fail('INVALID_BOUNDARY', 'Kesme penceresi benzersiz kimlik ve desteklenen tür içermelidir.');
    }
    ids.add(window.id);
    const start = parseInstant(window.startsAtUtc);
    const end = parseInstant(window.endedAtUtc);
    if (end <= start) return fail('INVALID_BOUNDARY', 'Kesme penceresi bitişi başlangıçtan sonra olmalıdır.');
    return { ...window, start, end };
  });
}

/**
 * Splits a VDY-004 actual work interval at local midnights and caller-supplied boundary windows.
 * It assigns no pay/legal class. A total-only nonzero break is kept unallocated at segment level.
 */
export function segmentWorkRecord(
  record: SegmentableWorkRecord,
  options: WorkSegmentationOptions = {},
): WorkSegmentationResult {
  const start = parseInstant(record?.startedAtUtc);
  const end = parseInstant(record?.endedAtUtc);
  if (end <= start) return fail('INVALID_RANGE', 'Fiilî bitiş anı başlangıçtan sonra olmalıdır.');
  const totalSpanMinutes = (end - start) / MINUTE_MS;
  if (!Number.isSafeInteger(totalSpanMinutes) || totalSpanMinutes > MAX_RECORD_MINUTES) {
    return fail('RANGE_TOO_LARGE', 'Segmentasyon aralığı 3660 günden uzun veya desteklenen dakika aralığının dışında.');
  }
  if (!Number.isSafeInteger(record.breakMinutes) || record.breakMinutes < 0 || record.breakMinutes > totalSpanMinutes) {
    return fail('INVALID_BREAK', 'Mola dakikası negatif olamaz veya fiilî aralığı aşamaz.');
  }

  const weekStartsOn = options.weekStartsOn ?? 1;
  const payrollPeriodStartDay = options.payrollPeriodStartDay ?? 1;
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6 ||
      !Number.isInteger(payrollPeriodStartDay) || payrollPeriodStartDay < 1 || payrollPeriodStartDay > 31) {
    return fail('INVALID_PERIOD_SETTINGS', 'Hafta başlangıcı 0–6; bordro dönemi başlangıç günü 1–31 olmalıdır.');
  }

  const formatter = formatterFor(record.timezone);
  const breaks = normalizeBreaks(options.breakIntervals, start, end, record.breakMinutes);
  const windows = normalizeBoundaryWindows(options.boundaryWindows);
  const cuts = new Set<number>([start, end]);
  addLocalDateCuts(cuts, start, end, formatter);
  for (const interval of breaks.intervals) {
    cuts.add(interval.start);
    cuts.add(interval.end);
  }
  for (const window of windows) {
    if (window.start > start && window.start < end) cuts.add(window.start);
    if (window.end > start && window.end < end) cuts.add(window.end);
  }

  const orderedCuts = [...cuts].sort((left, right) => left - right);
  if (orderedCuts.length - 1 > MAX_SEGMENTS) return fail('RANGE_TOO_LARGE', 'Segment sayısı izin verilen sınırı aşıyor.');
  const breakTiming = record.breakMinutes === 0 ? 'NONE' : breaks.known ? 'TIMED' : 'AGGREGATE_ONLY';
  const segments: WorkSegment[] = [];

  for (let index = 0; index < orderedCuts.length - 1; index += 1) {
    const segmentStart = orderedCuts[index];
    const segmentEnd = orderedCuts[index + 1];
    if (segmentEnd <= segmentStart) continue;
    const insideKnownBreak = breaks.intervals.some((interval) => segmentStart >= interval.start && segmentEnd <= interval.end);
    if (insideKnownBreak) continue;

    const localDate = localDateAt(formatter, segmentStart);
    const weekOffset = (weekday(localDate) - weekStartsOn + 7) % 7;
    const activeWindows = windows
      .filter((window) => segmentStart >= window.start && segmentStart < window.end)
      .sort((left, right) => left.id.localeCompare(right.id));
    const spanMinutes = (segmentEnd - segmentStart) / MINUTE_MS;
    segments.push({
      startedAtUtc: new Date(segmentStart).toISOString(),
      endedAtUtc: new Date(segmentEnd).toISOString(),
      spanMinutes,
      workedMinutes: breaks.known ? spanMinutes : null,
      localDate,
      weekStartLocalDate: addCalendarDays(localDate, -weekOffset),
      calendarMonth: localDate.slice(0, 7),
      calendarYear: Number(localDate.slice(0, 4)),
      payrollPeriodStartDate: periodStartDate(localDate, payrollPeriodStartDay),
      boundaryIds: activeWindows.map(({ id }) => id),
      boundaryKinds: activeWindows.map(({ kind }) => kind),
    });
  }

  return {
    timezone: record.timezone,
    totalSpanMinutes,
    totalBreakMinutes: record.breakMinutes,
    totalWorkedMinutes: totalSpanMinutes - record.breakMinutes,
    breakTiming,
    unallocatedBreakMinutes: breaks.known ? 0 : record.breakMinutes,
    segments,
  };
}
