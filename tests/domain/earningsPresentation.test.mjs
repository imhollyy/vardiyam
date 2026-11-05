import assert from 'node:assert/strict';
import test from 'node:test';

import { canApproveEarnings, shouldShowGrossEstimate } from '../../src/features/earnings/presentation.ts';
import { createDefaultSettings } from '../../src/features/earnings/profile.ts';

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
});
