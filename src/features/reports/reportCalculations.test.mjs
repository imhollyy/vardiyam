// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyShiftKind,
  computeShiftDistribution,
  computeDayOfWeekOvertime,
  computePeriodDelta,
} from './reportCalculations.ts';

// ── classifyShiftKind ────────────────────────────────────────────────────────

test('classifyShiftKind: 08:00 → day', () => {
  assert.equal(classifyShiftKind('08:00'), 'day');
});
test('classifyShiftKind: 06:00 → day', () => {
  assert.equal(classifyShiftKind('06:00'), 'day');
});
test('classifyShiftKind: 14:59 → day (boundary)', () => {
  assert.equal(classifyShiftKind('14:59'), 'day');
});
test('classifyShiftKind: 15:00 → evening', () => {
  assert.equal(classifyShiftKind('15:00'), 'evening');
});
test('classifyShiftKind: 18:59 → evening (boundary)', () => {
  assert.equal(classifyShiftKind('18:59'), 'evening');
});
test('classifyShiftKind: 19:00 → night', () => {
  assert.equal(classifyShiftKind('19:00'), 'night');
});
test('classifyShiftKind: 22:00 → night', () => {
  assert.equal(classifyShiftKind('22:00'), 'night');
});
test('classifyShiftKind: 00:00 → night', () => {
  assert.equal(classifyShiftKind('00:00'), 'night');
});
test('classifyShiftKind: 05:59 → night (boundary)', () => {
  assert.equal(classifyShiftKind('05:59'), 'night');
});
test('classifyShiftKind: invalid → day fallback', () => {
  assert.equal(classifyShiftKind(''), 'day');
});

// ── computeShiftDistribution ─────────────────────────────────────────────────

function makeDay(localDate, status, shiftTemplateId = null, isHoliday = false, overtimeMinutes = 0) {
  return { localDate, status, shiftTemplateId, isHoliday, leaveType: null, leaveHalfDay: false, leaveHours: 0, overtimeMinutes, lateEarlyMinutes: 0, isWeekend: false, shiftNominalMinutes: 0, note: null };
}

const tplMap = new Map([
  ['t-day', { startLocalTime: '08:00' }],
  ['t-eve', { startLocalTime: '16:00' }],
  ['t-night', { startLocalTime: '22:00' }],
]);

test('computeShiftDistribution: counts each kind correctly', () => {
  const days = [
    makeDay('2026-01-01', 'WORKED', 't-day'),
    makeDay('2026-01-02', 'WORKED', 't-day'),
    makeDay('2026-01-03', 'WORKED', 't-eve'),
    makeDay('2026-01-04', 'WORKED', 't-night'),
    makeDay('2026-01-05', 'LEAVE'),
    makeDay('2026-01-06', 'HOLIDAY'),
    makeDay('2026-01-07', 'OFF'),
  ];
  const dist = computeShiftDistribution(days, tplMap, '2026-01-01', '2026-01-07');
  assert.equal(dist.day, 2);
  assert.equal(dist.evening, 1);
  assert.equal(dist.night, 1);
  assert.equal(dist.leave, 1);
  assert.equal(dist.holiday, 1);
});

test('computeShiftDistribution: excludes days outside range', () => {
  const days = [
    makeDay('2026-01-01', 'WORKED', 't-day'),
    makeDay('2026-01-31', 'WORKED', 't-day'),
  ];
  const dist = computeShiftDistribution(days, tplMap, '2026-01-01', '2026-01-15');
  assert.equal(dist.day, 1);
});

test('computeShiftDistribution: isHoliday flag counts as holiday', () => {
  const days = [makeDay('2026-01-01', 'WORKED', 't-day', true)];
  const dist = computeShiftDistribution(days, tplMap, '2026-01-01', '2026-01-31');
  assert.equal(dist.holiday, 1);
  assert.equal(dist.day, 0);
});

// ── computeDayOfWeekOvertime ──────────────────────────────────────────────────

test('computeDayOfWeekOvertime: 2026-11-23 is Monday', () => {
  // Nov 2026 Mondays: 2,9,16,23,30 -> index 0
  const days = [makeDay('2026-11-23', 'WORKED', 't-day', false, 60)];
  const result = computeDayOfWeekOvertime(days);
  assert.equal(result.length, 7);
  assert.equal(result[0].totalMinutes, 60);
  assert.equal(result[0].label, 'Pzt');
});

test('computeDayOfWeekOvertime: 2026-11-28 is Saturday', () => {
  // Nov 23 Mon -> Nov 28 Sat -> index 5
  const days = [makeDay('2026-11-28', 'WORKED', 't-day', false, 90)];
  const result = computeDayOfWeekOvertime(days);
  assert.equal(result[5].totalMinutes, 90);
  assert.equal(result[5].label, 'Cmt');
});

test('computeDayOfWeekOvertime: zero overtime days contribute nothing', () => {
  const days = [makeDay('2026-11-23', 'WORKED', 't-day', false, 0)];
  const result = computeDayOfWeekOvertime(days);
  assert.equal(result[0].totalMinutes, 0);
});

test('computeDayOfWeekOvertime: accumulates across multiple days', () => {
  const days = [
    makeDay('2026-11-23', 'WORKED', 't-day', false, 30), // Mon -> idx 0
    makeDay('2026-11-29', 'WORKED', 't-day', false, 45), // Sun -> idx 6
    makeDay('2026-11-30', 'WORKED', 't-day', false, 20), // Mon -> idx 0
  ];
  const result = computeDayOfWeekOvertime(days);
  assert.equal(result[0].totalMinutes, 50); // 30 + 20
  assert.equal(result[6].totalMinutes, 45);
});

// ── computePeriodDelta ────────────────────────────────────────────────────────

test('computePeriodDelta: +50% gain', () => {
  assert.equal(computePeriodDelta(15000, 10000), 50);
});

test('computePeriodDelta: -25% loss', () => {
  assert.equal(computePeriodDelta(7500, 10000), -25);
});

test('computePeriodDelta: no change', () => {
  assert.equal(computePeriodDelta(10000, 10000), 0);
});

test('computePeriodDelta: prev null -> null', () => {
  assert.equal(computePeriodDelta(10000, null), null);
});

test('computePeriodDelta: prev zero -> null', () => {
  assert.equal(computePeriodDelta(10000, 0), null);
});

test('computePeriodDelta: rounds to integer', () => {
  // 10001 / 10000 = 0.01% -> rounds to 0
  assert.equal(computePeriodDelta(10001, 10000), 0);
  // 10050 / 10000 = 0.5% -> rounds to 1
  assert.equal(computePeriodDelta(10050, 10000), 1);
});
