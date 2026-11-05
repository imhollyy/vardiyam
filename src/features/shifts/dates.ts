import { addCalendarDays, dayOrdinal, type LocalDate } from '../../domain/shift-cycle/index.ts';

export type YearMonth = { year: number; month: number };

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
