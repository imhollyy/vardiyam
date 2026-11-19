import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addLocalDays,
  daysInMonth,
  getLocalToday,
  localDateForMonthDay,
  monthForLocalDate,
  monthRange,
  mondayFirstOffset,
  mondayFirstWeekdayOffset,
  shiftYearMonth,
} from '../../src/features/shifts/dates.ts';

test('month navigation crosses December and January in both directions', () => {
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
  assert.equal(shiftYearMonth('2027-01', -1), '2026-12');
});

test('month view uses leap-day and exact month boundaries', () => {
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2027-02'), 28);
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.equal(localDateForMonthDay('2028-02', 29), '2028-02-29');
});

test('calendar day addition crosses month and year boundaries without timestamp arithmetic', () => {
  assert.equal(addLocalDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addLocalDays('2028-02-28', 1), '2028-02-29');
});

test('Today screen uses full local dates for week start and YYYY-MM for calendar month', () => {
  const today = getLocalToday('Europe/Istanbul', new Date('2026-11-05T09:00:00.000Z'));
  assert.equal(today, '2026-11-05');
  assert.equal(mondayFirstWeekdayOffset(today), 3);
  const month = monthForLocalDate(today);
  assert.equal(month, '2026-11');
  assert.equal(mondayFirstOffset(month), 6);
  assert.throws(() => mondayFirstOffset(today), /Ay seçimi geçersiz/);
});

test('first-open Istanbul date and week layout remain correct across December to January', () => {
  const today = getLocalToday('Europe/Istanbul', new Date('2026-12-31T21:30:00.000Z'));
  assert.equal(today, '2027-01-01');
  assert.equal(monthForLocalDate(today), '2027-01');
  assert.equal(mondayFirstWeekdayOffset(today), 4);
  assert.equal(mondayFirstOffset(shiftYearMonth('2026-12', 1)), 4);
});

test('WorkRecord instants map to the intended local calendar months', () => {
  const records = [
    { startedAtUtc: '2026-12-31T20:00:00.000Z', timezone: 'Europe/Istanbul' },
    { startedAtUtc: '2026-12-31T22:30:00.000Z', timezone: 'Europe/Istanbul' },
  ];
  const localDates = records.map((record) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: record.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(record.startedAtUtc));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  });
  assert.deepEqual(localDates, ['2026-12-31', '2027-01-01']);
  assert.deepEqual(localDates.map(monthForLocalDate), ['2026-12', '2027-01']);
  assert.deepEqual(localDates.map(mondayFirstWeekdayOffset), [3, 4]);
});