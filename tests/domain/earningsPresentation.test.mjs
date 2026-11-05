import assert from 'node:assert/strict';
import test from 'node:test';

import { canApproveEarnings, shouldShowGrossEstimate } from '../../src/features/earnings/presentation.ts';
import { createDefaultSettings, makeCalculationInput } from '../../src/features/earnings/profile.ts';

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

test('work records before the saved pay profile effective date remain uncertain', () => {
  const settings = { ...createDefaultSettings(), payEffectiveFromUtc: '2026-01-06T00:00:00.000Z' };
  const input = makeCalculationInput({ settings, rules: [], ruleVersionId: 'rules-v1', calculationId: 'preview', calculatedAtUtc: '2026-01-10T00:00:00.000Z',
    records: [{ id: 'work', startedAtUtc: '2026-01-05T05:00:00.000Z', endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 }], completeWeekStarts: [] });
  assert.ok(input.unresolvedPolicyReasons.some((reason) => reason.includes('geçerlilik başlangıcından önce')));
});
