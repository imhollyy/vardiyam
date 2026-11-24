// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMonthEventLists } from '../../src/features/reports/buildMonthEventLists.ts';

function day(localDate, status, opts = {}) {
  return {
    localDate,
    status,
    leaveType: opts.leaveType ?? null,
    leaveHalfDay: opts.leaveHalfDay ?? false,
    leaveHours: opts.leaveHours ?? 0,
    overtimeMinutes: opts.overtimeMinutes ?? 0,
    lateEarlyMinutes: opts.lateEarlyMinutes ?? 0,
    isHoliday: opts.isHoliday ?? false,
    isWeekend: false,
    shiftTemplateId: opts.shiftTemplateId ?? null,
    shiftNominalMinutes: opts.shiftNominalMinutes ?? 480,
    note: null,
  };
}

test('3 leave days -> leaves list has 3 items', () => {
  const days = [
    day('2026-11-03', 'LEAVE', { leaveType: 'ANNUAL' }),
    day('2026-11-10', 'LEAVE', { leaveType: 'SICK' }),
    day('2026-11-17', 'LEAVE', { leaveType: 'UNPAID' }),
    day('2026-11-04', 'WORKED'),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.leaves.length, 3);
  assert.equal(result.leaves[0]?.localDate, '2026-11-03');
  assert.equal(result.leaves[0]?.leaveType, 'ANNUAL');
  assert.equal(result.leaves[0]?.deducted, false);  // ANNUAL is not deducted
  assert.equal(result.leaves[1]?.leaveType, 'SICK');
  assert.equal(result.leaves[1]?.deducted, false);  // SICK not deducted
  assert.equal(result.leaves[2]?.leaveType, 'UNPAID');
  assert.equal(result.leaves[2]?.deducted, true);   // UNPAID is deducted
});

test('manual overtime -> overtime list correct', () => {
  const days = [
    day('2026-11-03', 'WORKED', { overtimeMinutes: 120 }),
    day('2026-11-04', 'WORKED', { overtimeMinutes: 60 }),
    day('2026-11-05', 'WORKED'),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.overtime.length, 2);
  assert.equal(result.overtime[0]?.localDate, '2026-11-03');
  assert.equal(result.overtime[0]?.overtimeMinutes, 120);
  assert.equal(result.overtime[1]?.overtimeMinutes, 60);
});

test('empty month -> all empty arrays', () => {
  const days = [
    day('2026-11-01', 'OFF'),
    day('2026-11-02', 'OFF'),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.leaves.length, 0);
  assert.equal(result.overtime.length, 0);
  assert.equal(result.lateEarly.length, 0);
});

test('half-day leave flagged correctly', () => {
  const days = [
    day('2026-11-24', 'LEAVE', { leaveType: 'ANNUAL', leaveHalfDay: true }),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.leaves.length, 1);
  assert.equal(result.leaves[0]?.leaveHalfDay, true);
  assert.equal(result.leaves[0]?.leaveType, 'ANNUAL');
});

test('late/early events captured', () => {
  const days = [
    day('2026-11-05', 'WORKED', { lateEarlyMinutes: 30 }),
    day('2026-11-06', 'WORKED', { lateEarlyMinutes: 60 }),
    day('2026-11-07', 'WORKED'),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.lateEarly.length, 2);
  assert.equal(result.lateEarly[0]?.lateEarlyMinutes, 30);
  assert.equal(result.lateEarly[1]?.lateEarlyMinutes, 60);
});

test('HOLIDAY leave type not included in leaves list', () => {
  const days = [
    day('2026-10-29', 'HOLIDAY', { leaveType: 'HOLIDAY', isHoliday: true }),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.leaves.length, 0);
});

test('HOURLY leave included with hours', () => {
  const days = [
    day('2026-11-24', 'WORKED', { leaveType: 'HOURLY', leaveHours: 3 }),
  ];
  const result = buildMonthEventLists(days);
  assert.equal(result.leaves.length, 1);
  assert.equal(result.leaves[0]?.leaveHours, 3);
  assert.equal(result.leaves[0]?.deducted, true);  // HOURLY is deducted
});
