import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGrossEarnings,
  createDefaultEarningsRules,
  EARNINGS_ENGINE_VERSION,
  EARNINGS_ROUNDING_VERSION,
} from '../../src/domain/earnings.ts';

const starts = {
  monday: '2026-01-05T05:00:00.000Z', // 08:00 Europe/Istanbul
  sunday: '2026-01-11T05:00:00.000Z',
};

function rules(overrides = {}, mode = 'MONTHLY_GROSS') {
  const all = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', mode);
  return all.map((rule) => ({
    ...rule,
    ...overrides[rule.kind],
  }));
}

function fixture({
  durationMinutes = 60,
  start = starts.monday,
  contractMinutes = 45 * 60,
  overtimeBps = 15_000,
  extraBps = 12_500,
  monthlyGrossMinor = 4_500_000,
  dividerMinutes = 13_500,
  dividerConfirmed = true,
  mode = 'MONTHLY_GROSS',
  hourlyGrossMinor = 20_000,
  breakMinutes = 0,
  timedBreakIntervals,
  holidayDataset = {
    versionId: 'tr-holidays-synthetic-v1', source: 'synthetic://test-fixture',
    coveredFromUtc: '2025-01-01T00:00:00.000Z', coveredToUtc: '2028-01-01T00:00:00.000Z', windows: [],
  },
  restWindows = [],
  workplaceHolidayWindows = [],
  ruleOverrides = {},
  timezone = 'Europe/Istanbul',
  weekStartsOn = 1,
  payrollPeriodStartDay = 1,
  completeWeekStarts = ['2026-01-05'],
  contractUnclear = false,
  basePolicyConfirmed = true,
  manualRuleSelections,
  records,
} = {}) {
  const useRecords = records ?? [{
    id: 'synthetic-work-1', startedAtUtc: start,
    endedAtUtc: new Date(Date.parse(start) + durationMinutes * 60_000).toISOString(),
    timezone, breakMinutes, ...(timedBreakIntervals ? { timedBreakIntervals } : {}),
  }];
  const from = '2026-01-01T00:00:00.000Z';
  return {
    calculationId: 'synthetic-calc-1', calculatedAtUtc: '2026-02-01T00:00:00.000Z',
    payProfile: mode === 'MONTHLY_GROSS'
      ? { mode, currency: 'TRY', monthlyGrossMinor, monthlyDivider: { minutes: dividerMinutes, confirmed: dividerConfirmed, source: 'user-confirmed synthetic fixture' } }
      : { mode, currency: 'TRY', hourlyGrossMinor },
    ruleSet: {
      profileId: 'synthetic-profile-v1', versionId: 'synthetic-rules-v1', timezone, weekStartsOn, payrollPeriodStartDay,
      rules: rules({
        OVERTIME: { multiplierBasisPoints: overtimeBps },
        EXTRA_HOURS: { multiplierBasisPoints: extraBps },
        ...ruleOverrides,
      }, mode),
      contract: { versionId: 'synthetic-contract-v1', weeklyMinutes: contractMinutes, effectiveFromUtc: from, effectiveToUtc: null, averagingOrEqualizationUnclear: contractUnclear },
      holidayDataset,
      workplaceRestWindows: restWindows,
      workplaceHolidayWindows,
      includedBasePolicyConfirmed: basePolicyConfirmed,
    },
    records: useRecords,
    completeWeekStarts,
    ...(manualRuleSelections ? { manualRuleSelections } : {}),
  };
}

test('40 independent synthetic financial fixtures verify integer-kuruş overtime calculations', async (t) => {
  const cases = Array.from({ length: 40 }, (_, index) => ({
    id: `gross-overtime-fixture-${String(index + 1).padStart(2, '0')}`,
    hourlyBaseMinor: 12_345 + index * 137,
    multiplierBps: 10_001 + index * 251,
  }));
  assert.equal(cases.length, 40);
  for (const item of cases) {
    await t.test(item.id, () => {
      const monthlyGrossMinor = item.hourlyBaseMinor * 225;
      const result = calculateGrossEarnings(fixture({
        durationMinutes: 46 * 60,
        monthlyGrossMinor,
        overtimeBps: item.multiplierBps,
      }));
      const expected = Math.floor((item.hourlyBaseMinor * item.multiplierBps * 2 + 10_000) / 20_000);
      assert.equal(result.status, 'COMPLETE');
      assert.equal(result.totalAmountMinor, expected);
      assert.equal(result.snapshot.engineVersion, EARNINGS_ENGINE_VERSION);
      assert.equal(result.snapshot.roundingVersion, EARNINGS_ROUNDING_VERSION);
    });
  }
});

test('2h × 200 TL × 1.50 produces 600 TL above the 45-hour weekly threshold', () => {
  const result = calculateGrossEarnings(fixture({ durationMinutes: 47 * 60 }));
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.totalAmountMinor, 60_000);
  assert.deepEqual(result.lines.filter((line) => line.selectedRuleKind === 'OVERTIME').map((line) => line.minutes), [120]);
  assert.equal(result.lines.filter((line) => line.selectedRuleKind === 'NORMAL').reduce((sum, line) => sum + line.amountMinor, 0), 0);
});

test('40-hour contract identifies the 40→45 range as +25% before +50% overtime', () => {
  const result = calculateGrossEarnings(fixture({ durationMinutes: 43 * 60, contractMinutes: 40 * 60 }));
  assert.equal(result.totalAmountMinor, 75_000);
  assert.equal(result.lines.filter((line) => line.selectedRuleKind === 'EXTRA_HOURS').reduce((sum, line) => sum + line.minutes, 0), 180);
  assert.equal(result.lines.some((line) => line.selectedRuleKind === 'OVERTIME'), false);
});

test('the maximum one multiplier wins a holiday overlap and equal maxima require manual selection', () => {
  const rest = [{ id: 'real-rest-day', startsAtUtc: starts.monday, endedAtUtc: '2026-01-05T07:00:00.000Z' }];
  const holiday = { versionId: 'holidays-v4', source: 'synthetic fixture source', coveredFromUtc: '2025-01-01T00:00:00.000Z', coveredToUtc: '2028-01-01T00:00:00.000Z', windows: [{
    id: 'official-day', kind: 'PUBLIC_HOLIDAY', startsAtUtc: starts.monday, endedAtUtc: '2026-01-05T07:00:00.000Z',
  }] };
  const distinct = calculateGrossEarnings(fixture({
    restWindows: rest, holidayDataset: holiday,
    ruleOverrides: { WORKPLACE_REST_DAY: { multiplierBasisPoints: 20_000 }, PUBLIC_HOLIDAY: { multiplierBasisPoints: 25_000 } },
  }));
  assert.equal(distinct.totalAmountMinor, 30_000); // 2.5×, premium-only against monthly base.
  assert.equal(distinct.lines[0].selectedRuleKind, 'PUBLIC_HOLIDAY');
  assert.match(distinct.lines[0].selectionReason, /tek katsayı/);

  const tied = calculateGrossEarnings(fixture({
    restWindows: rest, holidayDataset: holiday,
    ruleOverrides: { WORKPLACE_REST_DAY: { multiplierBasisPoints: 20_000 }, PUBLIC_HOLIDAY: { multiplierBasisPoints: 20_000 } },
  }));
  assert.equal(tied.totalAmountMinor, null);
  assert.equal(tied.uncertainties[0].code, 'RULE_TIE');
  const selected = calculateGrossEarnings(fixture({
    restWindows: rest, holidayDataset: holiday,
    ruleOverrides: { WORKPLACE_REST_DAY: { multiplierBasisPoints: 20_000 }, PUBLIC_HOLIDAY: { multiplierBasisPoints: 20_000 } },
    manualRuleSelections: [{ segmentId: 'synthetic-work-1:2026-01-05T05:00:00.000Z:2026-01-05T06:00:00.000Z:2026-01-05T05:00:00.000Z', ruleId: 'workplace-default-public_holiday' }],
  }));
  assert.equal(selected.totalAmountMinor, 20_000);
  assert.match(selected.lines[0].selectionReason, /Kullanıcı/);
});

test('net-only and skipped pay modes never return a gross estimate or snapshot', () => {
  for (const mode of ['NET_ONLY', 'SKIP']) {
    const result = calculateGrossEarnings(fixture({ mode }));
    assert.equal(result.status, 'NO_GROSS_MODE');
    assert.equal(result.totalAmountMinor, null);
    assert.equal(result.snapshot, null);
    assert.equal(result.lines.length, 0);
  }
});

test('225-hour monthly divisor proposal cannot be used without explicit confirmation', () => {
  const result = calculateGrossEarnings(fixture({ durationMinutes: 47 * 60, dividerConfirmed: false }));
  assert.equal(result.status, 'WITHHELD');
  assert.equal(result.totalAmountMinor, null);
  assert.equal(result.uncertainties[0].code, 'MONTHLY_DIVIDER_UNCONFIRMED');
});

test('monthly base salary rejects normal-time rules that would add the included base again', () => {
  const result = calculateGrossEarnings(fixture({
    mode: 'MONTHLY_GROSS', durationMinutes: 60,
    ruleOverrides: { NORMAL: { amountBasis: 'FULL_MULTIPLIER' } },
  }));
  assert.equal(result.status, 'WITHHELD');
  assert.equal(result.totalAmountMinor, null);
  assert.ok(result.uncertainties.some((u) => u.code === 'BASE_POLICY_UNCONFIRMED'));
});

test('aggregate-only breaks keep pay classification uncertain; timed breaks are deducted exactly', () => {
  const aggregate = calculateGrossEarnings(fixture({ durationMinutes: 47 * 60, breakMinutes: 30 }));
  assert.equal(aggregate.totalAmountMinor, null);
  assert.ok(aggregate.uncertainties.some((u) => u.code === 'BREAK_TIMING_UNKNOWN'));

  const timed = calculateGrossEarnings(fixture({
    durationMinutes: 47 * 60, breakMinutes: 30,
    timedBreakIntervals: [{ startedAtUtc: '2026-01-06T01:00:00.000Z', endedAtUtc: '2026-01-06T01:30:00.000Z' }],
  }));
  assert.equal(timed.totalAmountMinor, 45_000); // 1.5 overtime hours × 200 TL × 1.50.
  assert.equal(timed.lines.reduce((sum, line) => sum + line.minutes, 0), 46 * 60 + 30);
});

test('weekend, actual rest day, holiday and OFF are distinct inputs', () => {
  const saturday = calculateGrossEarnings(fixture({ start: '2026-01-10T05:00:00.000Z', durationMinutes: 120 }));
  assert.equal(saturday.totalAmountMinor, 80_000);
  assert.equal(saturday.lines[0].selectedRuleKind, 'CALENDAR_WEEKEND');
  assert.equal(saturday.lines[0].selectedRuleName.includes('hafta tatili'), false);

  const weekdayRest = calculateGrossEarnings(fixture({
    start: '2026-01-07T05:00:00.000Z', durationMinutes: 120,
    restWindows: [{ id: 'explicit-rest-wed', startsAtUtc: '2026-01-07T05:00:00.000Z', endedAtUtc: '2026-01-07T07:00:00.000Z' }],
  }));
  assert.equal(weekdayRest.lines[0].selectedRuleKind, 'WORKPLACE_REST_DAY');
  assert.equal(weekdayRest.totalAmountMinor, 40_000); // 2× premium-only, base salary already included.
});

test('workplace holiday rate is independent and supports a custom +75% multiplier', () => {
  const result = calculateGrossEarnings(fixture({
    start: '2026-01-07T05:00:00.000Z', durationMinutes: 60,
    workplaceHolidayWindows: [{ id: 'company-special-day', startsAtUtc: '2026-01-07T05:00:00.000Z', endedAtUtc: '2026-01-07T06:00:00.000Z' }],
    ruleOverrides: { WORKPLACE_HOLIDAY: { multiplierBasisPoints: 17_500, amountBasis: 'FULL_MULTIPLIER' } },
  }));
  assert.equal(result.totalAmountMinor, 35_000);
  assert.equal(result.lines[0].selectedRuleKind, 'WORKPLACE_HOLIDAY');
  assert.equal(result.lines[0].multiplierBasisPoints, 17_500);
});

test('source-versioned holiday data applies the 28 October 13:00 boundary without inferring legal status', () => {
  const result = calculateGrossEarnings(fixture({
    start: '2026-10-28T09:00:00.000Z', durationMinutes: 120,
    completeWeekStarts: ['2026-10-26'],
    holidayDataset: { versionId: 'synthetic-holiday-2026-v1', source: 'synthetic source reference', coveredFromUtc: '2025-01-01T00:00:00.000Z', coveredToUtc: '2028-01-01T00:00:00.000Z', windows: [{
      id: 'half-day-from-13', kind: 'HALF_DAY_HOLIDAY', startsAtUtc: '2026-10-28T10:00:00.000Z', endedAtUtc: '2026-10-28T11:00:00.000Z',
    }] },
  }));
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines.map((line) => [line.localDate, line.minutes, line.selectedRuleKind]), [
    ['2026-10-28', 60, 'NORMAL'], ['2026-10-28', 60, 'PUBLIC_HOLIDAY'],
  ]);
  assert.equal(result.totalAmountMinor, 20_000);
});

test('year rollover, DST elapsed minutes, payroll period and rule validity are split exactly', () => {
  const year = calculateGrossEarnings(fixture({
    start: '2026-12-31T20:00:00.000Z', durationMinutes: 8 * 60,
    completeWeekStarts: ['2026-12-28'],
  }));
  assert.deepEqual([...new Set(year.lines.map((line) => line.localDate))], ['2026-12-31', '2027-01-01']);

  const payroll = calculateGrossEarnings(fixture({
    start: '2026-01-14T20:00:00.000Z', durationMinutes: 8 * 60,
    payrollPeriodStartDay: 15,
  }));
  assert.ok(payroll.lines.some((line) => line.payrollPeriodStartDate === '2025-12-15'));
  assert.ok(payroll.lines.some((line) => line.payrollPeriodStartDate === '2026-01-15'));

  const dst = calculateGrossEarnings(fixture({
    timezone: 'America/New_York', weekStartsOn: 0, start: '2026-03-08T06:00:00.000Z', durationMinutes: 120,
    completeWeekStarts: ['2026-03-08'], mode: 'HOURLY_GROSS', hourlyGrossMinor: 20_000,
    ruleOverrides: { NORMAL: { amountBasis: 'FULL_MULTIPLIER' } },
  }));
  assert.equal(dst.lines.reduce((sum, line) => sum + line.minutes, 0), 120);
  assert.equal(dst.totalAmountMinor, 80_000); // DST Sunday is a calendar weekend; no rest-day inference.

  const versionedInput = fixture({ durationMinutes: 60 });
  const oldNormal = versionedInput.ruleSet.rules.find((rule) => rule.kind === 'NORMAL');
  oldNormal.effectiveToUtc = '2026-01-05T05:30:00.000Z';
  versionedInput.ruleSet.rules.push({ ...oldNormal, id: 'normal-v2', effectiveFromUtc: '2026-01-05T05:30:00.000Z', effectiveToUtc: null, amountBasis: 'INCLUDED_IN_BASE' });
  const versioned = calculateGrossEarnings(versionedInput);
  assert.equal(versioned.lines.length, 2);
  assert.deepEqual(new Set(versioned.lines.map((line) => line.selectedRuleId)), new Set(['workplace-default-normal', 'normal-v2']));
  assert.equal(versioned.lines.reduce((sum, line) => sum + line.minutes, 0), 60);
});

test('overlapping records, missing holiday provenance, incomplete week and unclear equalization withhold total', () => {
  const overlap = fixture({ records: [
    { id: 'a', startedAtUtc: starts.monday, endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 },
    { id: 'b', startedAtUtc: '2026-01-05T05:30:00.000Z', endedAtUtc: '2026-01-05T06:30:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 },
  ] });
  assert.equal(calculateGrossEarnings(overlap).totalAmountMinor, null);
  assert.ok(calculateGrossEarnings(overlap).uncertainties.some((u) => u.code === 'OVERLAPPING_WORK'));
  assert.equal(calculateGrossEarnings(fixture({ holidayDataset: null })).totalAmountMinor, null);
  assert.equal(calculateGrossEarnings(fixture({ holidayDataset: {
    versionId: 'old-coverage', source: 'synthetic fixture source', coveredFromUtc: '2025-01-01T00:00:00.000Z',
    coveredToUtc: '2026-01-05T05:30:00.000Z', windows: [],
  } })).totalAmountMinor, null);
  assert.equal(calculateGrossEarnings(fixture({ completeWeekStarts: [] })).totalAmountMinor, null);
  assert.equal(calculateGrossEarnings(fixture({ contractUnclear: true })).totalAmountMinor, null);
});

test('rule revisions and snapshot inputs are stable and explicitly versioned', () => {
  const original = fixture({ durationMinutes: 47 * 60 });
  const first = calculateGrossEarnings(original);
  const changed = fixture({ durationMinutes: 47 * 60, overtimeBps: 18_000 });
  const second = calculateGrossEarnings(changed);
  assert.equal(first.snapshot.ruleSetVersionId, 'synthetic-rules-v1');
  assert.equal(first.snapshot.contractVersionId, 'synthetic-contract-v1');
  assert.equal(first.snapshot.holidayDatasetVersion, 'tr-holidays-synthetic-v1');
  assert.notEqual(first.totalAmountMinor, second.totalAmountMinor);
  assert.equal(first.snapshot.lines.find((line) => line.selectedRuleKind === 'OVERTIME').multiplierBasisPoints, 15_000);
  assert.equal(first.totalAmountMinor, 60_000); // the earlier result is immutable value data.
});

test('half-up rounding is deterministic at the final kuruş and line items explain the result', () => {
  const result = calculateGrossEarnings(fixture({
    durationMinutes: 46 * 60, monthlyGrossMinor: 225, dividerMinutes: 13_500,
    overtimeBps: 15_000,
  }));
  const line = result.lines.find((candidate) => candidate.selectedRuleKind === 'OVERTIME');
  assert.equal(line.amountMinor, 2);
  assert.equal(line.roundingMode, 'minor-unit-half-up-v1');
  assert.equal(line.ruleSetVersionId, 'synthetic-rules-v1');
  assert.equal(line.minutes, 60);
  assert.match(line.hourlyBaseDescription, /Aylık brüt/);
  assert.match(line.selectionReason, /Tek geçerli kural/);
});

test('hourly rule bases are explicit and the amount agrees with included-base explanation', () => {
  const normal = calculateGrossEarnings(fixture({
    mode: 'HOURLY_GROSS', hourlyGrossMinor: 20_000, durationMinutes: 120,
    ruleOverrides: { NORMAL: { amountBasis: 'FULL_MULTIPLIER' } },
  }));
  assert.equal(normal.totalAmountMinor, 40_000);
  assert.equal(normal.lines[0].includedInBaseSalary, false);

  const premium = calculateGrossEarnings(fixture({
    mode: 'HOURLY_GROSS', hourlyGrossMinor: 20_000, durationMinutes: 120,
    start: '2026-01-07T05:00:00.000Z',
    restWindows: [{ id: 'explicit-rest', startsAtUtc: '2026-01-07T05:00:00.000Z', endedAtUtc: '2026-01-07T07:00:00.000Z' }],
    ruleOverrides: { WORKPLACE_REST_DAY: { amountBasis: 'PREMIUM_ONLY' } },
  }));
  assert.equal(premium.totalAmountMinor, 40_000); // two hours × base × +100% premium only.
  assert.equal(premium.lines[0].includedInBaseSalary, true);

  const alreadyIncluded = calculateGrossEarnings(fixture({
    mode: 'HOURLY_GROSS', hourlyGrossMinor: 20_000, durationMinutes: 120,
    ruleOverrides: { NORMAL: { amountBasis: 'INCLUDED_IN_BASE' } },
  }));
  assert.equal(alreadyIncluded.totalAmountMinor, 0);
  assert.equal(alreadyIncluded.lines[0].includedInBaseSalary, true);
});

test('unsafe coefficients, line overflow, and aggregate overflow return typed uncertainty instead of throwing', () => {
  const unsafeRule = fixture({ ruleOverrides: { NORMAL: { multiplierBasisPoints: Number.MAX_SAFE_INTEGER + 1 } } });
  assert.equal(calculateGrossEarnings(unsafeRule).uncertainties[0].code, 'INVALID_INPUT');

  const lineOverflow = calculateGrossEarnings(fixture({
    mode: 'HOURLY_GROSS', hourlyGrossMinor: Number.MAX_SAFE_INTEGER, durationMinutes: 120,
    ruleOverrides: { NORMAL: { amountBasis: 'FULL_MULTIPLIER' } },
  }));
  assert.equal(lineOverflow.totalAmountMinor, null);
  assert.ok(lineOverflow.uncertainties.some((u) => u.code === 'AMOUNT_OVERFLOW'));

  const aggregateOverflow = calculateGrossEarnings(fixture({
    mode: 'HOURLY_GROSS', hourlyGrossMinor: 5_000_000_000_000_000,
    ruleOverrides: { NORMAL: { amountBasis: 'FULL_MULTIPLIER' } },
    records: [
      { id: 'overflow-a', startedAtUtc: starts.monday, endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 },
      { id: 'overflow-b', startedAtUtc: '2026-01-06T05:00:00.000Z', endedAtUtc: '2026-01-06T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 },
    ],
  }));
  assert.equal(aggregateOverflow.totalAmountMinor, null);
  assert.ok(aggregateOverflow.uncertainties.some((u) => u.code === 'AMOUNT_OVERFLOW'));
});
