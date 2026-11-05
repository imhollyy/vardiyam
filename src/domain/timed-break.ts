import type { WorkRecord } from './work-record.ts';

export type TimedBreakInterval = {
  id: string;
  startedAtUtc: string;
  endedAtUtc: string;
};

export type WorkRecordBreakInterval = TimedBreakInterval & {
  workRecordId: string;
};

export type TimedBreakOccurrenceChoices = {
  startOccurrence: 'earlier' | 'later' | null;
  endOccurrence: 'earlier' | 'later' | null;
};

/** A timezone change invalidates every prior local-wall-time fold choice. */
export function resetTimedBreakOccurrences<T extends TimedBreakOccurrenceChoices>(
  drafts: readonly T[],
): T[] {
  return drafts.map((draft) => ({ ...draft, startOccurrence: null, endOccurrence: null }));
}

export type TimedBreakErrorCode =
  | 'INVALID_BREAK_ID'
  | 'INVALID_BREAK_INSTANT'
  | 'INVALID_BREAK_RANGE'
  | 'BREAK_OUTSIDE_RECORD'
  | 'OVERLAPPING_BREAKS'
  | 'BREAK_TOTAL_MISMATCH';

export class TimedBreakError extends Error {
  readonly code: TimedBreakErrorCode;

  constructor(code: TimedBreakErrorCode, message: string) {
    super(message);
    this.name = 'TimedBreakError';
    this.code = code;
  }
}

const CANONICAL_UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/;
const MINUTE_MS = 60_000;

function parseUtcMinute(value: string): number {
  if (!CANONICAL_UTC_MINUTE.test(value)) {
    throw new TimedBreakError('INVALID_BREAK_INSTANT', 'Mola saatleri UTC dakika hassasiyetinde girilmelidir.');
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) {
    throw new TimedBreakError('INVALID_BREAK_INSTANT', 'Mola tarihi veya saati geçersiz.');
  }
  return instant;
}

/** Validates timed, unpaid break intervals. Empty intervals preserve aggregate-only legacy timing. */
export function validateTimedBreakIntervals(
  record: WorkRecord,
  intervals: readonly TimedBreakInterval[],
): void {
  const recordStart = Date.parse(record.startedAtUtc);
  const recordEnd = Date.parse(record.endedAtUtc);
  const ids = new Set<string>();
  const parsed = intervals.map((interval) => {
    if (!interval || typeof interval.id !== 'string' || !interval.id.trim() || ids.has(interval.id)) {
      throw new TimedBreakError('INVALID_BREAK_ID', 'Her mola için benzersiz bir kimlik gerekir.');
    }
    ids.add(interval.id);
    return { start: parseUtcMinute(interval.startedAtUtc), end: parseUtcMinute(interval.endedAtUtc) };
  }).sort((left, right) => left.start - right.start);

  let totalMinutes = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    const interval = parsed[index];
    if (interval.end <= interval.start) {
      throw new TimedBreakError('INVALID_BREAK_RANGE', 'Mola bitiş saati başlangıçtan sonra olmalıdır.');
    }
    if (interval.start < recordStart || interval.end > recordEnd) {
      throw new TimedBreakError('BREAK_OUTSIDE_RECORD', 'Mola çalışma kaydının zaman aralığı içinde olmalıdır.');
    }
    if (index > 0 && interval.start < parsed[index - 1].end) {
      throw new TimedBreakError('OVERLAPPING_BREAKS', 'Mola aralıkları çakışamaz; bitişik molalara izin verilir.');
    }
    totalMinutes += (interval.end - interval.start) / MINUTE_MS;
  }

  if (parsed.length > 0 && totalMinutes !== record.breakMinutes) {
    throw new TimedBreakError('BREAK_TOTAL_MISMATCH', 'Zamanlı molaların toplamı mola dakikasıyla eşleşmelidir.');
  }
}
