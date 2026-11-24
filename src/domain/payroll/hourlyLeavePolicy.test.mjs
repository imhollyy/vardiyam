// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyHourlyLeavePolicy } from './hourlyLeavePolicy.ts';

// ── Test 1: BASE_PAY — overtime unchanged, leave goes to base deduction ───────

test('BASE_PAY: 2h leave, 42h overtime -> overtime stays, baseDeduction=120', () => {
  const result = applyHourlyLeavePolicy(
    2520, // 42h in minutes
    [{ deductOverride: null, leaveHours: 2 }],
    'BASE_PAY',
  );
  assert.equal(result.overtimeMinutes, 2520);
  assert.equal(result.baseDeductionMinutes, 120);
  assert.equal(result.offsetFromOvertimeMinutes, 0);
});

// ── Test 2: OVERTIME_FIRST — leave offset from overtime ──────────────────────

test('OVERTIME_FIRST: 2h leave, 42h overtime -> overtime reduced, baseDeduction=0', () => {
  const result = applyHourlyLeavePolicy(
    2520, // 42h
    [{ deductOverride: null, leaveHours: 2 }],
    'OVERTIME_FIRST',
  );
  assert.equal(result.overtimeMinutes, 2400); // 42h - 2h = 40h
  assert.equal(result.baseDeductionMinutes, 0);
  assert.equal(result.offsetFromOvertimeMinutes, 120);
});

// ── Test 3: OVERTIME_FIRST with 0 overtime — full base deduction ─────────────

test('OVERTIME_FIRST: 2h leave, 0 overtime -> overtime=0, baseDeduction=120', () => {
  const result = applyHourlyLeavePolicy(
    0,
    [{ deductOverride: null, leaveHours: 2 }],
    'OVERTIME_FIRST',
  );
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.baseDeductionMinutes, 120);
  assert.equal(result.offsetFromOvertimeMinutes, 0);
});

// ── Test 4: OVERTIME_FIRST partial — 3h leave, 1h overtime ──────────────────

test('OVERTIME_FIRST: 3h leave, 1h overtime -> overtime=0, baseDeduction=120, offset=60', () => {
  const result = applyHourlyLeavePolicy(
    60, // 1h
    [{ deductOverride: null, leaveHours: 3 }],
    'OVERTIME_FIRST',
  );
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.offsetFromOvertimeMinutes, 60);
  assert.equal(result.baseDeductionMinutes, 120); // 2h remaining
});

// ── Test 5: deductOverride=false → no deduction, no offset ──────────────────

test('deductOverride=false: free leave, no deduction regardless of policy', () => {
  const resultBase = applyHourlyLeavePolicy(
    2520,
    [{ deductOverride: false, leaveHours: 2 }],
    'BASE_PAY',
  );
  assert.equal(resultBase.baseDeductionMinutes, 0);
  assert.equal(resultBase.overtimeMinutes, 2520);

  const resultOT = applyHourlyLeavePolicy(
    2520,
    [{ deductOverride: false, leaveHours: 2 }],
    'OVERTIME_FIRST',
  );
  assert.equal(resultOT.baseDeductionMinutes, 0);
  assert.equal(resultOT.overtimeMinutes, 2520);
});

// ── Test 6: deductOverride=true → always base deduct, even OVERTIME_FIRST ────

test('deductOverride=true: mandatory base deduction regardless of policy', () => {
  const result = applyHourlyLeavePolicy(
    2520, // 42h overtime
    [{ deductOverride: true, leaveHours: 2 }],
    'OVERTIME_FIRST',
  );
  // mandatory never offsets overtime
  assert.equal(result.overtimeMinutes, 2520);
  assert.equal(result.baseDeductionMinutes, 120);
  assert.equal(result.offsetFromOvertimeMinutes, 0);
});

// ── Test 7: Multiple HOURLY days, OVERTIME_FIRST ─────────────────────────────

test('Multiple HOURLY days: 2h+1h=3h total, OVERTIME_FIRST, 42h overtime', () => {
  const result = applyHourlyLeavePolicy(
    2520,
    [
      { deductOverride: null, leaveHours: 2 },
      { deductOverride: null, leaveHours: 1 },
    ],
    'OVERTIME_FIRST',
  );
  assert.equal(result.overtimeMinutes, 2520 - 180); // 42h - 3h = 39h
  assert.equal(result.baseDeductionMinutes, 0);
  assert.equal(result.offsetFromOvertimeMinutes, 180);
});

// ── Test 8: Mixed deductOverride values ──────────────────────────────────────

test('Mixed: null + false + true leaves — only null and true processed', () => {
  const result = applyHourlyLeavePolicy(
    120, // 2h overtime
    [
      { deductOverride: null, leaveHours: 2 },   // normal: policy applies
      { deductOverride: false, leaveHours: 1 },  // free: skip
      { deductOverride: true, leaveHours: 1 },   // mandatory: base deduct
    ],
    'OVERTIME_FIRST',
  );
  // normal 2h: offset min(120, 120)=120 from overtime
  // mandatory 1h: always base deduct
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.offsetFromOvertimeMinutes, 120);
  assert.equal(result.baseDeductionMinutes, 60); // 1h mandatory
});

// ── Test 9: Empty inputs — no change ─────────────────────────────────────────

test('No HOURLY leave days: no change', () => {
  const result = applyHourlyLeavePolicy(2520, [], 'OVERTIME_FIRST');
  assert.equal(result.overtimeMinutes, 2520);
  assert.equal(result.baseDeductionMinutes, 0);
  assert.equal(result.offsetFromOvertimeMinutes, 0);
});
