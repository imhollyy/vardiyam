import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addLocalDays,
  daysInMonth,
  localDateForMonthDay,
  monthRange,
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
