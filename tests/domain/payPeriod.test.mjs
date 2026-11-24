import assert from 'node:assert/strict';
import test from 'node:test';

import { getPayPeriodForDate, getPayPeriod, daysUntilPayday } from '../../src/domain/payroll/index.ts';

// ---------------------------------------------------------------------------
// getPayPeriod (temel)
// ---------------------------------------------------------------------------

test('getPayPeriod: payday=15, Kasım 2026 → 16.10–15.11', () => {
  const { start, end } = getPayPeriod(2026, 11, '15');
  assert.equal(start, '2026-10-16');
  assert.equal(end, '2026-11-15');
});

test('getPayPeriod: payday=1, Ocak 2026 → 02.12.2025–01.01.2026', () => {
  const { start, end } = getPayPeriod(2026, 1, '1');
  assert.equal(start, '2025-12-02');
  assert.equal(end, '2026-01-01');
});

test('getPayPeriod: payday=LAST, Şubat 2026 → 01.02–28.02', () => {
  const { start, end } = getPayPeriod(2026, 2, 'LAST');
  assert.equal(start, '2026-02-01');
  assert.equal(end, '2026-02-28');
});

// ---------------------------------------------------------------------------
// getPayPeriodForDate
// ---------------------------------------------------------------------------

test('payday=15, bugün=23.11.2026 → dönem 16.11–15.12', () => {
  const { start, end } = getPayPeriodForDate('2026-11-23', '15');
  assert.equal(start, '2026-11-16');
  assert.equal(end, '2026-12-15');
});

test('payday=15, bugün=15.11.2026 (maaş günü) → dönem 16.10–15.11', () => {
  const { start, end } = getPayPeriodForDate('2026-11-15', '15');
  assert.equal(start, '2026-10-16');
  assert.equal(end, '2026-11-15');
});

test('payday=15, bugün=16.11.2026 (bir sonraki dönem ilk günü) → dönem 16.11–15.12', () => {
  const { start, end } = getPayPeriodForDate('2026-11-16', '15');
  assert.equal(start, '2026-11-16');
  assert.equal(end, '2026-12-15');
});

test('payday=1, bugün=01.01.2026 (maaş günü) → dönem 02.12.2025–01.01.2026', () => {
  const { start, end } = getPayPeriodForDate('2026-01-01', '1');
  assert.equal(start, '2025-12-02');
  assert.equal(end, '2026-01-01');
});

test('payday=1, bugün=02.01.2026 (yeni dönem ilk günü) → dönem 02.01–01.02', () => {
  const { start, end } = getPayPeriodForDate('2026-01-02', '1');
  assert.equal(start, '2026-01-02');
  assert.equal(end, '2026-02-01');
});

test('getPayPeriodForDate her zaman localDate içeren bir dönem döndürür', () => {
  const testDates = [
    '2026-01-01', '2026-01-15', '2026-02-28', '2026-03-01',
    '2026-06-15', '2026-11-16', '2026-11-30', '2026-12-31',
  ];
  for (const date of testDates) {
    const { start, end } = getPayPeriodForDate(date, '15');
    assert.ok(date >= start && date <= end, `${date} dönem [${start}, ${end}] içinde olmalı`);
  }
});

test('label: aynı ay ise "Kas 2026" formatında', () => {
  // payday=LAST: dönem 01.11–30.11 → aynı ay → "Kas 2026"
  const { label: sameMonthLabel } = getPayPeriodForDate('2026-11-15', 'LAST');
  assert.ok(sameMonthLabel.includes('Kas'), `label "${sameMonthLabel}" "Kas" içermeli`);
  assert.ok(sameMonthLabel.includes('2026'), `label "${sameMonthLabel}" "2026" içermeli`);
});

test('payday=LAST, Şubat → dönem sonu 28 Şubat (artık yıl değil)', () => {
  const { end } = getPayPeriodForDate('2026-02-15', 'LAST');
  assert.equal(end, '2026-02-28');
});

// ---------------------------------------------------------------------------
// daysUntilPayday
// ---------------------------------------------------------------------------

test('daysUntilPayday: LAST + 2026-11-24 → 6', () => {
  assert.equal(daysUntilPayday('2026-11-24', 'LAST'), 6);
});

test('daysUntilPayday: LAST + 2026-11-30 → 0 (maaş günü)', () => {
  assert.equal(daysUntilPayday('2026-11-30', 'LAST'), 0);
});

test('daysUntilPayday: LAST + 2026-02-10 → 18 (şubat sonu)', () => {
  assert.equal(daysUntilPayday('2026-02-10', 'LAST'), 18);
});

test('daysUntilPayday: payday=15 + 2026-11-24 → 21', () => {
  assert.equal(daysUntilPayday('2026-11-24', '15'), 21);
});

test('daysUntilPayday: payday=31 + 2026-02-10 → 18 (31 şubatta 28\'e kısıtlanır)', () => {
  assert.equal(daysUntilPayday('2026-02-10', '31'), 18);
});

test('daysUntilPayday: payday=15 + 2026-11-15 → 0 (maaş günü)', () => {
  assert.equal(daysUntilPayday('2026-11-15', '15'), 0);
});
