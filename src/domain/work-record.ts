import { dayOrdinal, type LocalDate } from './shift-cycle/index.ts';

export type WorkRecordSource = 'MANUAL' | 'PLANNED';

export type PlannedWorkSnapshot = {
  cycleId: string | null;
  localDate: LocalDate;
  templateId: string | null;
  templateName: string;
  startLocalDateTime: string;
  endLocalDateTime: string;
};

export type WorkRecord = {
  id: string;
  source: WorkRecordSource;
  startedAtUtc: string;
  endedAtUtc: string;
  timezone: string;
  breakMinutes: number;
  note: string | null;
  planned: PlannedWorkSnapshot | null;
};

export type WorkRecordErrorCode =
  | 'INVALID_RECORD'
  | 'INVALID_TIMEZONE'
  | 'INVALID_LOCAL_DATE_TIME'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'INVALID_INSTANT_RANGE'
  | 'INVALID_BREAK'
  | 'INVALID_PLAN_SNAPSHOT';

export class WorkRecordError extends Error {
  readonly code: WorkRecordErrorCode;

  constructor(code: WorkRecordErrorCode, message: string) {
    super(message);
    this.name = 'WorkRecordError';
    this.code = code;
  }
}

function fail(code: WorkRecordErrorCode, message: string): never {
  throw new WorkRecordError(code, message);
}

function parseLocalDateTime(value: string): { localDate: LocalDate; hour: number; minute: number } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fail('INVALID_LOCAL_DATE_TIME', 'Tarih ve saat YYYY-MM-DDTHH:mm biçiminde olmalıdır.');
  const [, localDate, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  try {
    dayOrdinal(localDate);
  } catch {
    return fail('INVALID_LOCAL_DATE_TIME', 'Tarih geçerli bir takvim günü olmalıdır.');
  }
  if (hour > 23 || minute > 59) return fail('INVALID_LOCAL_DATE_TIME', 'Saat 00:00–23:59 aralığında olmalıdır.');
  return { localDate, hour, minute };
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return fail('INVALID_TIMEZONE', 'Zaman dilimi desteklenen bir IANA kimliği olmalıdır.');
  }
  try {
    return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    return fail('INVALID_TIMEZONE', 'Zaman dilimi desteklenen bir IANA kimliği olmalıdır.');
  }
}

function utcMilliseconds(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function partsAt(formatter: Intl.DateTimeFormat, instant: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  return {
    year: parts.year, month: parts.month, day: parts.day,
    hour: parts.hour, minute: parts.minute, second: parts.second,
  };
}

function sameLocalMinute(
  formatter: Intl.DateTimeFormat,
  instant: number,
  desired: { localDate: string; hour: number; minute: number },
): boolean {
  const parts = partsAt(formatter, instant);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` === desired.localDate &&
    parts.hour === desired.hour && parts.minute === desired.minute && parts.second === 0;
}

/** Returns all actual instants matching an IANA wall time, in chronological order. */
export function getLocalDateTimeCandidates(value: string, timezone: string): string[] {
  const desired = parseLocalDateTime(value);
  const formatter = formatterFor(timezone);
  const [year, month, day] = desired.localDate.split('-').map(Number);
  const wallMilliseconds = utcMilliseconds(year, month, day, desired.hour, desired.minute, 0);
  const offsets = new Set<number>();

  for (let sample = wallMilliseconds - 36 * 60 * 60_000; sample <= wallMilliseconds + 36 * 60 * 60_000; sample += 3 * 60 * 60_000) {
    const parts = partsAt(formatter, sample);
    offsets.add(utcMilliseconds(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second) - sample);
  }

  const candidates = [...offsets]
    .map((offset) => wallMilliseconds - offset)
    .filter((instant) => sameLocalMinute(formatter, instant, desired))
    .sort((left, right) => left - right)
    .map((instant) => new Date(instant).toISOString());
  return [...new Set(candidates)];
}

/** Converts an IANA wall time to a UTC instant; DST folds require an explicit occurrence choice. */
export function localDateTimeToUtc(
  value: string,
  timezone: string,
  occurrence?: 'earlier' | 'later',
): string {
  const candidates = getLocalDateTimeCandidates(value, timezone);
  if (candidates.length === 0) return fail('NONEXISTENT_LOCAL_TIME', 'Bu yerel saat yaz saati geçişi nedeniyle oluşmuyor.');
  if (candidates.length > 1 && occurrence === undefined) {
    return fail('AMBIGUOUS_LOCAL_TIME', 'Bu yerel saat iki farklı ana denk geliyor; ilk veya ikinci oluşum seçilmelidir.');
  }
  return candidates[occurrence === 'later' ? candidates.length - 1 : 0];
}

export function utcToLocalDateTime(instantUtc: string, timezone: string): string {
  const instant = Date.parse(instantUtc);
  if (!Number.isFinite(instant)) return fail('INVALID_LOCAL_DATE_TIME', 'Kayıtlı zaman geçersiz.');
  const parts = partsAt(formatterFor(timezone), instant);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function validateWorkRecord(record: WorkRecord): void {
  if (!record || typeof record.id !== 'string' || record.id.trim() === '' || !['MANUAL', 'PLANNED'].includes(record.source)) {
    return fail('INVALID_RECORD', 'Çalışma kaydı kimliği veya kaynağı geçersiz.');
  }
  formatterFor(record.timezone);
  const canonicalUtcMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/;
  if (typeof record.startedAtUtc !== 'string' || typeof record.endedAtUtc !== 'string' ||
      !canonicalUtcMinute.test(record.startedAtUtc) || !canonicalUtcMinute.test(record.endedAtUtc)) {
    return fail('INVALID_INSTANT_RANGE', 'Başlangıç ve bitiş UTC zamanı dakika hassasiyetinde ISO biçiminde olmalıdır.');
  }
  const start = Date.parse(record.startedAtUtc);
  const end = Date.parse(record.endedAtUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      new Date(start).toISOString() !== record.startedAtUtc || new Date(end).toISOString() !== record.endedAtUtc ||
      start % 60_000 !== 0 || end % 60_000 !== 0 || end <= start) {
    return fail('INVALID_INSTANT_RANGE', 'Bitiş anı başlangıçtan sonra ve dakika sınırında olmalıdır.');
  }
  const elapsedMinutes = (end - start) / 60_000;
  if (!Number.isSafeInteger(record.breakMinutes) || record.breakMinutes < 0 || record.breakMinutes > elapsedMinutes) {
    return fail('INVALID_BREAK', 'Mola dakikası tam sayı olmalı ve kayıt aralığını aşmamalıdır.');
  }
  if (record.note !== null && (typeof record.note !== 'string' || record.note.length > 2000)) {
    return fail('INVALID_RECORD', 'Not en fazla 2000 karakter olabilir.');
  }

  if (record.source === 'MANUAL') {
    if (record.planned !== null) return fail('INVALID_PLAN_SNAPSHOT', 'Plansız kayıtta plan bağlantısı bulunamaz.');
    return;
  }

  const planned = record.planned;
  if (!planned || typeof planned.templateName !== 'string' || !planned.templateName.trim() || !planned.startLocalDateTime || !planned.endLocalDateTime) {
    return fail('INVALID_PLAN_SNAPSHOT', 'Planlı kayıtta plan vardiyası anlık görüntüsü eksik.');
  }
  try {
    dayOrdinal(planned.localDate);
  } catch {
    return fail('INVALID_PLAN_SNAPSHOT', 'Plan yerel tarihi geçersiz.');
  }
  const plannedStart = parseLocalDateTime(planned.startLocalDateTime);
  const plannedEnd = parseLocalDateTime(planned.endLocalDateTime);
  if (plannedStart.localDate !== planned.localDate || planned.endLocalDateTime <= planned.startLocalDateTime) {
    return fail('INVALID_PLAN_SNAPSHOT', 'Plan başlangıç/bitiş tarihi geçersiz.');
  }
  // Parse validates both wall times even when no DST conversion is needed.
  void plannedEnd;
}

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} sa ${String(absolute % 60).padStart(2, '0')} dk`;
}

export function getRecordRangeDifferenceMinutes(record: WorkRecord): number | null {
  if (!record.planned) return null;
  const actual = (Date.parse(record.endedAtUtc) - Date.parse(record.startedAtUtc)) / 60_000;
  try {
    const plannedStart = getLocalDateTimeCandidates(record.planned.startLocalDateTime, record.timezone);
    const plannedEnd = getLocalDateTimeCandidates(record.planned.endLocalDateTime, record.timezone);
    // A wall time inside a DST gap has no instant; a fold has two possible instants.
    // Until the plan stores an explicit occurrence, don't imply a duration comparison.
    if (plannedStart.length !== 1 || plannedEnd.length !== 1) return null;
    return actual - (Date.parse(plannedEnd[0]) - Date.parse(plannedStart[0])) / 60_000;
  } catch {
    return null;
  }
}
