// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateScheduledOvertime, WEEKLY_LIMIT_MINUTES } from './overtime.ts';
import { deriveDays } from './index.ts';

// Nov 2026 Mon-Fri workdays: 2,3,4,5,6, 9,10,11,12,13, 16,17,18,19,20, 23,24,25,26,27, 30
// 21 workdays total
// Shift: 08:00-20:00, break 60 min -> gross 720, net 660 min/day

/** @param {string} id @param {string} start @param {string} end */
function tpl(id, start, end) {
  return { id, code: id, name: id, startLocalTime: start, endLocalTime: end, standardMinutes: 480, breakMinutes: 60, colorToken: null, iconKey: null };
}

const T = tpl('t1', '08:00', '20:00'); // net 660 min

/** Build a minimal DerivedDay */
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
    shiftTemplateId: opts.noTemplate ? null : 't1',
    shiftNominalMinutes: 720,
    note: null,
  };
}

function workedDay(localDate) {
  return day(localDate, 'WORKED');
}

// Nov 2026 Mon-Fri dates
const NOV_MON_FRI = [
  '2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06',
  '2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13',
  '2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20',
  '2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27',
  '2026-11-30',
];

// ── Test 1: no leave → 42h scheduled overtime ──────────────────────────────

test('no leave: 4 full weeks -> 40h (2400 min) scheduled overtime', () => {
  // Nov 2-27: 4 full Mon-Fri weeks × (5×660=3300 min, excess=600, 5×120=600) = 2400
  // Nov 30 alone: 660 < 2700, no overtime
  const days = NOV_MON_FRI.map(workedDay);
  const result = calculateScheduledOvertime(days, [T]);
  const total = result.reduce((s, o) => s + o.scheduledOvertimeMinutes, 0);
  assert.equal(total, 2400);
  assert.equal(result.length, 20); // Nov 30 produces no entry (no excess)
});

// ── Test 2: Nov 24 annual leave → 40h ──────────────────────────────────────

test('Nov 24 annual leave: other worked days still get 120 min each', () => {
  // Nov 23-27: 4 WORKED + 1 ANNUAL LEAVE
  // standardDayMin = 2700/5 = 540
  // weekTotal = 4x660 + 540 = 3180, excess = 480, 4 days x 120 = 480
  // 3 full weeks (Nov 2-6, 9-13, 16-20): 3x600 = 1800
  // Nov 30 alone: 660 < 2700, no excess
  // Total = 2280 (less than 2400 without leave)
  const days = NOV_MON_FRI.map((d) => {
    if (d === '2026-11-24') return day(d, 'LEAVE', { leaveType: 'ANNUAL' });
    return workedDay(d);
  });
  const result = calculateScheduledOvertime(days, [T]);
  const total = result.reduce((s, o) => s + o.scheduledOvertimeMinutes, 0);
  assert.equal(total, 2280);
  // Nov 24 (LEAVE) gets no overtime entry
  assert.ok(!result.find((o) => o.localDate === '2026-11-24'));
  // The 4 WORKED days in the leave week still get 120 min each
  const leaveWeekDays = result.filter(
    (o) => o.localDate >= '2026-11-23' && o.localDate <= '2026-11-27',
  );
  assert.equal(leaveWeekDays.length, 4);
  for (const o of leaveWeekDays) {
    assert.equal(o.scheduledOvertimeMinutes, 120);
  }
});

// ── Test 3: leave day with overtime_minutes in DB → zeroed in DerivedDay ───

test('deriveDays: full-day ANNUAL leave zeros out stored overtime_minutes', () => {
  const settings = {
    salaryMinor: 5000000,
    salaryType: /** @type {'GROSS'} */('GROSS'),
    payday: '30',
    besEnabled: false,
    besRateBp: 300,
    workSchedule: /** @type {'MON_FRI'} */('MON_FRI'),
    shiftPattern: /** @type {'FIXED_DAY'} */('FIXED_DAY'),
    startDate: null,
    setupCompleted: true,
  };
  const entry = {
    localDate: '2026-11-24',
    shiftOverrideId: null,
    overtimeMinutes: 120,
    lateEarlyMinutes: 0,
    leaveType: /** @type {'ANNUAL'} */('ANNUAL'),
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  };
  const entryMap = new Map([['2026-11-24', entry]]);
  const derived = deriveDays(['2026-11-24'], entryMap, settings);
  assert.equal(derived[0].overtimeMinutes, 0);
  assert.equal(derived[0].status, 'LEAVE');
});

// ── Test 4: leave day with late_early_minutes in DB → zeroed in DerivedDay ─

test('deriveDays: full-day ANNUAL leave zeros out stored late_early_minutes', () => {
  const settings = {
    salaryMinor: 5000000,
    salaryType: /** @type {'GROSS'} */('GROSS'),
    payday: '30',
    besEnabled: false,
    besRateBp: 300,
    workSchedule: /** @type {'MON_FRI'} */('MON_FRI'),
    shiftPattern: /** @type {'FIXED_DAY'} */('FIXED_DAY'),
    startDate: null,
    setupCompleted: true,
  };
  const entry = {
    localDate: '2026-11-24',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 60,
    leaveType: /** @type {'ANNUAL'} */('ANNUAL'),
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  };
  const entryMap = new Map([['2026-11-24', entry]]);
  const derived = deriveDays(['2026-11-24'], entryMap, settings);
  assert.equal(derived[0].lateEarlyMinutes, 0);
});

// ── Test 5: half-day ANNUAL leave → standardDayMin/2 contribution ──────────

test('half-day ANNUAL leave: contributes standardDayMin/2, no overtime distribution', () => {
  // Week Nov 23-27: 4 WORKED + 1 half-day LEAVE
  // standardDayMin = 2700/5 = 540
  // weekTotal = 4×660 + 540/2 = 2640+270 = 2910
  // excess = 2910-2700 = 210, perDay = 210/4 = 52.5 -> round = 53
  const days = [
    workedDay('2026-11-23'),
    day('2026-11-24', 'LEAVE', { leaveType: 'ANNUAL', leaveHalfDay: true }),
    workedDay('2026-11-25'),
    workedDay('2026-11-26'),
    workedDay('2026-11-27'),
  ];
  const result = calculateScheduledOvertime(days, [T]);
  // Nov 24 (half-day leave) should NOT be in result
  assert.ok(!result.find((o) => o.localDate === '2026-11-24'));
  // 4 WORKED days should each get round(52.5) = 53 min
  assert.equal(result.length, 4);
  for (const o of result) {
    assert.equal(o.scheduledOvertimeMinutes, 53);
  }
});

// ── Test 6: HOURLY leave → status WORKED, net reduced, overtime distributable ─

test('HOURLY leave: deriveDays sets status WORKED', () => {
  const settings = {
    salaryMinor: 5000000,
    salaryType: /** @type {'GROSS'} */('GROSS'),
    payday: '30',
    besEnabled: false,
    besRateBp: 300,
    workSchedule: /** @type {'MON_FRI'} */('MON_FRI'),
    shiftPattern: /** @type {'FIXED_DAY'} */('FIXED_DAY'),
    startDate: null,
    setupCompleted: true,
  };
  const entry = {
    localDate: '2026-11-24',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: /** @type {'HOURLY'} */('HOURLY'),
    leaveHalfDay: false,
    leaveHours: 4,
    deductOverride: null,
    note: null,
  };
  const entryMap = new Map([['2026-11-24', entry]]);
  const derived = deriveDays(['2026-11-24'], entryMap, settings);
  assert.equal(derived[0].status, 'WORKED');
  assert.equal(derived[0].leaveType, 'HOURLY');
  assert.equal(derived[0].leaveHours, 4);
});

test('HOURLY leave: overtime distribution uses reduced net (660-240=420)', () => {
  // Week Nov 23-27: 4 normal WORKED (660 min) + 1 HOURLY leave WORKED (660-4×60=420 min)
  // No LEAVE days -> scheduledWorkDays = 5, standardDayMin = 540 (not used for WORKED)
  // weekTotal = 4×660 + 420 = 3060
  // excess = 3060-2700 = 360, perDay = 360/5 = 72
  const days = [
    workedDay('2026-11-23'),
    day('2026-11-24', 'WORKED', { leaveType: 'HOURLY', leaveHours: 4 }),
    workedDay('2026-11-25'),
    workedDay('2026-11-26'),
    workedDay('2026-11-27'),
  ];
  const result = calculateScheduledOvertime(days, [T]);
  // All 5 WORKED days (including HOURLY) get overtime
  assert.equal(result.length, 5);
  for (const o of result) {
    assert.equal(o.scheduledOvertimeMinutes, 72);
  }
  // Nov 24 (HOURLY) is in result
  assert.ok(result.find((o) => o.localDate === '2026-11-24'));
});
