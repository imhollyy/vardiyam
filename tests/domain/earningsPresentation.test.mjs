import assert from 'node:assert/strict';
import test from 'node:test';

import { canApproveEarnings, shouldShowGrossEstimate } from '../../src/features/earnings/presentation.ts';
import { createDefaultRules, createDefaultSettings, earningsOnboardingDraft, earningsPayEffectiveFromOnboardingSave, earningsRulesForOnboardingSave, isEarningsRules, isEarningsSettings, makeCalculationInput } from '../../src/features/earnings/profile.ts';

test('net-only and skip modes omit the gross estimate presentation entirely', () => {
  assert.equal(shouldShowGrossEstimate('NET_ONLY'), false);
  assert.equal(shouldShowGrossEstimate('SKIP'), false);
  assert.equal(shouldShowGrossEstimate('MONTHLY_GROSS'), true);
  assert.equal(shouldShowGrossEstimate('HOURLY_GROSS'), true);
});

test('only complete non-null results with a snapshot can be approved', () => {
  assert.equal(canApproveEarnings(null), false);
  assert.equal(canApproveEarnings({ status: 'PARTIAL', totalAmountMinor: 100, snapshot: {} }), false);
  assert.equal(canApproveEarnings({ status: 'WITHHELD', totalAmountMinor: null, snapshot: {} }), false);
  assert.equal(canApproveEarnings({ status: 'COMPLETE', totalAmountMinor: 100, snapshot: null }), false);
  assert.equal(canApproveEarnings({ status: 'COMPLETE', totalAmountMinor: 100, snapshot: {} }), true);
});

test('fresh settings keep the 225 hour divisor unconfirmed and every week incomplete', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.monthlyDividerMinutes, 225 * 60);
  assert.equal(settings.monthlyDividerConfirmed, false);
  assert.deepEqual(settings.completeWeekStarts, []);
  assert.equal(settings.holidayNoWindowsConfirmed, false);
  assert.equal(settings.workplaceWindowCoverageConfirmed, false);
  assert.equal(settings.payEffectiveFromUtc, '');
  assert.equal(settings.rulesEffectiveFromUtc, '');
});

test('reopening onboarding hydrates saved gross mode, amount, payroll day, and weekly hours', () => {
  const monthly = { ...createDefaultSettings(), mode: 'MONTHLY_GROSS', monthlyGrossMinor: 3_500_050,
    payrollPeriodStartDay: 15, weeklyMinutes: 2_700 };
  assert.deepEqual(earningsOnboardingDraft(monthly), { mode: 'MONTHLY_GROSS', pay: '35000.5', periodDay: '15', weeklyHours: '45' });
  const hourly = { ...createDefaultSettings(), mode: 'HOURLY_GROSS', hourlyGrossMinor: 1_234 };
  assert.equal(earningsOnboardingDraft(hourly).pay, '12.34');
  const netOnly = { ...createDefaultSettings(), mode: 'NET_ONLY' };
  assert.equal(earningsOnboardingDraft(netOnly).pay, '');
});

test('onboarding saves preserve workplace rule versions unless pay mode changes their amount basis', () => {
  const settings = { ...createDefaultSettings(), mode: 'MONTHLY_GROSS', rulesEffectiveFromUtc: '2026-01-01T00:00:00.000Z' };
  const customRules = createDefaultRules('MONTHLY_GROSS').map((rule) => ({ ...rule, effectiveFromUtc: '2026-01-01T00:00:00.000Z',
    multiplierBasisPoints: rule.kind === 'OVERTIME' ? 17_500 : rule.multiplierBasisPoints,
    name: rule.kind === 'OVERTIME' ? 'Custom workplace overtime' : rule.name }));
  const sameMode = earningsRulesForOnboardingSave(settings, customRules, 'MONTHLY_GROSS', '2026-11-09T00:00:00.000Z');
  const overtime = sameMode.rules.find((rule) => rule.kind === 'OVERTIME');
  assert.equal(overtime.multiplierBasisPoints, 17_500);
  assert.equal(overtime.name, 'Custom workplace overtime');
  assert.equal(overtime.effectiveFromUtc, '2026-01-01T00:00:00.000Z');
  assert.equal(sameMode.rulesEffectiveFromUtc, settings.rulesEffectiveFromUtc);
  const changedMode = earningsRulesForOnboardingSave(settings, customRules, 'HOURLY_GROSS', '2026-11-09T00:00:00.000Z');
  const changedOvertime = changedMode.rules.find((rule) => rule.kind === 'OVERTIME');
  assert.equal(changedOvertime.multiplierBasisPoints, 17_500);
  assert.equal(changedOvertime.amountBasis, 'FULL_MULTIPLIER');
  assert.equal(changedOvertime.effectiveFromUtc, '2026-11-09T00:00:00.000Z');
});

test('onboarding period-only edits do not change the effective date of an unchanged pay rate', () => {
  const settings = { ...createDefaultSettings(), mode: 'MONTHLY_GROSS', monthlyGrossMinor: 3_500_000,
    payEffectiveFromUtc: '2026-01-01T00:00:00.000Z' };
  assert.equal(earningsPayEffectiveFromOnboardingSave(settings, 'MONTHLY_GROSS', 3_500_000, '2026-11-09T00:00:00.000Z'),
    '2026-01-01T00:00:00.000Z');
  assert.equal(earningsPayEffectiveFromOnboardingSave(settings, 'MONTHLY_GROSS', 3_600_000, '2026-11-09T00:00:00.000Z'),
    '2026-11-09T00:00:00.000Z');
  assert.equal(earningsPayEffectiveFromOnboardingSave(settings, 'HOURLY_GROSS', 3_500_000, '2026-11-09T00:00:00.000Z'),
    '2026-11-09T00:00:00.000Z');
});

test('earnings profile guard rejects malformed period and timezone values while accepting SKIP defaults', () => {
  const defaults = createDefaultSettings();
  assert.equal(isEarningsSettings(defaults), true);
  assert.equal(isEarningsSettings({ ...defaults, payrollPeriodStartDay: 0 }), false);
  assert.equal(isEarningsSettings({ ...defaults, timezone: 'Not/A_Zone' }), false);
  assert.equal(isEarningsSettings({ ...defaults, weeklyMinutes: Number.NaN }), false);
  assert.equal(isEarningsSettings({ ...defaults, mode: 'MONTHLY_GROSS', monthlyGrossMinor: 4_000_000 }), false);
  assert.equal(isEarningsSettings({ ...defaults, payEffectiveFromUtc: '2026-02-31T00:00:00.000Z' }), false);
});

test('earnings settings accepts only unique, well-formed rule versions before rendering them', () => {
  const rules = createDefaultRules();
  assert.equal(isEarningsRules(rules), true);
  assert.equal(isEarningsRules([rules[0], null]), false);
  assert.equal(isEarningsRules([rules[0], rules[0]]), false);
  assert.equal(isEarningsRules(rules.slice(1)), false);
  const reversedValidity = rules.map((rule, index) => index === 0 ? { ...rule, effectiveToUtc: '1999-01-01T00:00:00.000Z' } : rule);
  assert.equal(isEarningsRules(reversedValidity), false);
});

test('work records before the saved pay profile effective date remain uncertain', () => {
  const settings = { ...createDefaultSettings(), payEffectiveFromUtc: '2026-01-06T00:00:00.000Z' };
  const input = makeCalculationInput({ settings, rules: [], ruleVersionId: 'rules-v1', calculationId: 'preview', calculatedAtUtc: '2026-01-10T00:00:00.000Z',
    records: [{ id: 'work', startedAtUtc: '2026-01-05T05:00:00.000Z', endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 }], completeWeekStarts: [] });
  assert.ok(input.unresolvedPolicyReasons.some((reason) => reason.includes('geçerlilik başlangıcından önce')));
});
