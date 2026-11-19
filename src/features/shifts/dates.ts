import { addCalendarDays, dayOrdinal, type LocalDate } from '../../domain/shift-cycle/index.ts';

export type YearMonth = { year: number; month: number };

// --- Timezone resolution helpers (moved from domain/work-record.ts) ---

function parseLocalDateTime(value: string): { localDate: string; hour: number; minute: number } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Tarih ve saat YYYY-MM-DDTHH:mm biçiminde olmalıdır.');
  const [, localDate, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  try { dayOrdinal(localDate); } catch { throw new Error('Tarih geçerli bir takvim günü olmalıdır.'); }
  if (hour > 23 || minute > 59) throw new Error('Saat 00:00–23:59 aralığında olmalıdır.');
  return { localDate, hour, minute };
}

function tzFormatterFor(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || timezone.trim() === '') throw new Error('Zaman dilimi desteklenen bir IANA kimliği olmalıdır.');
  try {
    return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch { throw new Error('Zaman dilimi desteklenen bir IANA kimliği olmalıdır.'); }
}

function utcMs(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function partsAt(formatter: Intl.DateTimeFormat, instant: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

function sameLocalMinute(formatter: Intl.DateTimeFormat, instant: number, desired: { localDate: string; hour: number; minute: number }): boolean {
  const parts = partsAt(formatter, instant);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` === desired.localDate &&
    parts.hour === desired.hour && parts.minute === desired.minute && parts.second === 0;
}

export function getLocalDateTimeCandidates(value: string, timezone: string): string[] {
  const desired = parseLocalDateTime(value);
  const formatter = tzFormatterFor(timezone);
  const [year, month, day] = desired.localDate.split('-').map(Number);
  const wallMilliseconds = utcMs(year, month, day, desired.hour, desired.minute, 0);
  const offsets = new Set<number>();
  for (let sample = wallMilliseconds - 36 * 60 * 60_000; sample <= wallMilliseconds + 36 * 60 * 60_000; sample += 3 * 60 * 60_000) {
    const parts = partsAt(formatter, sample);
    offsets.add(utcMs(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => wallMilliseconds - offset)
    .filter((instant) => sameLocalMinute(formatter, instant, desired))
    .sort((left, right) => left - right)
    .map((instant) => new Date(instant).toISOString());
  return [...new Set(candidates)];
}

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} sa ${String(absolute % 60).padStart(2, '0')} dk`;
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

export function getLocalToday(timezone: string, now = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function parseYearMonth(value: string): YearMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Ay seçimi geçersiz.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    throw new Error('Ay seçimi geçersiz.');
  }
  return { year, month };
}

export function shiftYearMonth(value: string, amount: number): string {
  const { year, month } = parseYearMonth(value);
  const absoluteMonth = year * 12 + month - 1 + amount;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = absoluteMonth - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${padded(nextMonth)}`;
}

export function localDateForMonthDay(yearMonth: string, day: number): LocalDate {
  const { year, month } = parseYearMonth(yearMonth);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(yearMonth)) {
    throw new Error('Ayın günü geçersiz.');
  }
  const value = `${String(year).padStart(4, '0')}-${padded(month)}-${padded(day)}`;
  dayOrdinal(value);
  return value;
}

export function addLocalDays(value: LocalDate, amount: number): LocalDate {
  return addCalendarDays(value, amount);
}

export function daysInMonth(value: string): number {
  const { year, month } = parseYearMonth(value);
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const MONDAY_ANCHOR_ORDINAL = dayOrdinal('1970-01-05');

/** Returns the Monday-first weekday index (Monday 0 … Sunday 6) for a full local date. */
export function mondayFirstWeekdayOffset(value: LocalDate): number {
  const daysFromMonday = dayOrdinal(value) - MONDAY_ANCHOR_ORDINAL;
  return ((daysFromMonday % 7) + 7) % 7;
}
export function mondayFirstOffset(value: string): number {
  const { year, month } = parseYearMonth(value);
  return (new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay() + 6) % 7;
}

export function formatMonthTitle(value: string, locale = 'tr-TR'): string {
  const { year, month } = parseYearMonth(value);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function formatLocalDate(value: LocalDate, options?: Intl.DateTimeFormatOptions): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Takvim tarihi geçersiz.');
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(date);
}

export function monthRange(value: string): { start: LocalDate; end: LocalDate } {
  return {
    start: localDateForMonthDay(value, 1),
    end: localDateForMonthDay(value, daysInMonth(value)),
  };
}

export function monthForLocalDate(value: LocalDate): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) {
    throw new Error('Takvim tarihi geçersiz.');
  }
  return `${match[1]}-${match[2]}`;
}
