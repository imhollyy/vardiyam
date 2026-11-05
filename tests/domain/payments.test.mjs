import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTryMinor, parseTryMinor, reconcileNetPayments, validateLocalDate } from '../../src/domain/payments.ts';
import { payrollPeriodForMonth } from '../../src/features/payments/period.ts';

test('Turkish and invariant decimal input are parsed as exact kuruş', () => {
  assert.equal(parseTryMinor('35.000,50'), 3_500_050);
  assert.equal(parseTryMinor('35000.50'), 3_500_050);
  assert.equal(parseTryMinor('35000,50'), 3_500_050);
  assert.equal(parseTryMinor('35.000'), 3_500_000);
  assert.throws(() => parseTryMinor('35,000.50'));
  assert.throws(() => parseTryMinor('1,234'));
  assert.throws(() => parseTryMinor('-1,00'));
  assert.equal(parseTryMinor('0,00', true), 0);
  assert.throws(() => parseTryMinor('0,00'));
  assert.throws(() => parseTryMinor('90071992547409.92'));
  assert.match(formatTryMinor(3_500_050), /35\.000,50/);
  assert.match(formatTryMinor(Number.MAX_SAFE_INTEGER), /90\.071\.992\.547\.409,91/);
});

test('payslip net reconciles bank plus cash, partial payment, unknown, and overpayment', () => {
  assert.deepEqual(reconcileNetPayments(3_500_000, 3_000_000 + 500_000, 0), {
    payslipNetMinor: 3_500_000, allocatedPaymentMinor: 3_500_000, differenceMinor: 0, unallocatedPaymentMinor: 0,
  });
  assert.equal(reconcileNetPayments(3_500_000, 3_000_000, 0).differenceMinor, 500_000);
  assert.equal(reconcileNetPayments(null, 3_000_000, 0).differenceMinor, null);
  assert.equal(reconcileNetPayments(0, 0, 0).differenceMinor, 0);
  assert.equal(reconcileNetPayments(3_500_000, 4_000_000, 0).differenceMinor, -500_000);
});

test('local payment dates require a real Gregorian calendar day', () => {
  validateLocalDate('2028-02-29');
  assert.throws(() => validateLocalDate('2027-02-29'));
  assert.throws(() => validateLocalDate('2026-13-01'));
});

test('payroll periods retain explicit 15-to-14 boundaries and clamp short months safely', () => {
  assert.deepEqual(payrollPeriodForMonth('2026-01', 15, 'Europe/Istanbul'), {
    id: 'period:Europe/Istanbul:2026-01-15:2026-02-15', startLocalDate: '2026-01-15', endExclusiveLocalDate: '2026-02-15', timezone: 'Europe/Istanbul', configuredStartDay: 15,
  });
  assert.equal(payrollPeriodForMonth('2027-02', 31, 'Europe/Istanbul').startLocalDate, '2027-02-28');
});

test('gross estimate amount is never an input to net payment difference', () => {
  const grossEstimateMinor = 4_000_000;
  const actualNetPaymentMinor = 3_200_000;
  const netOnlyReconciliation = reconcileNetPayments(null, actualNetPaymentMinor, 0);
  assert.equal(grossEstimateMinor - actualNetPaymentMinor, 800_000);
  assert.equal(netOnlyReconciliation.differenceMinor, null);
  // Gross is deliberately absent from reconciliation's contract; no gross-net shortage is inferred.
  assert.equal('grossEstimateMinor' in netOnlyReconciliation, false);
});
