// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { salaryOn, proRatedSalary, getSalarySlices } from './salaryHistory.ts';

/** @type {import('./salaryHistory.ts').SalaryHistoryEntry[]} */
const makeEntry = (from, minor) => ({
  id: from,
  effectiveFrom: from,
  salaryMinor: minor,
  createdAt: '2024-01-01T00:00:00.000Z',
});

// ── salaryOn ──────────────────────────────────────────────────────────────────

test('salaryOn: empty history returns 0', () => {
  assert.equal(salaryOn('2024-03-15', []), 0);
});

test('salaryOn: before first entry returns first entry salary', () => {
  const history = [makeEntry('2024-03-01', 30000)];
  assert.equal(salaryOn('2024-02-01', history), 30000);
});

test('salaryOn: on first entry date returns that salary', () => {
  const history = [makeEntry('2024-03-01', 30000)];
  assert.equal(salaryOn('2024-03-01', history), 30000);
});

test('salaryOn: after raise returns new salary', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-07-01', 30000)];
  assert.equal(salaryOn('2024-07-15', history), 30000);
});

test('salaryOn: before raise returns old salary', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-07-01', 30000)];
  assert.equal(salaryOn('2024-06-30', history), 20000);
});

test('salaryOn: on raise date returns new salary', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-07-01', 30000)];
  assert.equal(salaryOn('2024-07-01', history), 30000);
});

// ── proRatedSalary ────────────────────────────────────────────────────────────

test('proRatedSalary: empty history returns 0', () => {
  assert.equal(proRatedSalary('2024-03-01', '2024-03-31', []), 0);
});

test('proRatedSalary: single entry same salary all month', () => {
  const history = [makeEntry('2024-01-01', 30000)];
  assert.equal(proRatedSalary('2024-03-01', '2024-03-31', history), 30000);
});

test('proRatedSalary: raise mid-month weights correctly', () => {
  // 10 days at 20000, 21 days at 30000, total 31 days
  // weighted = (20000*10 + 30000*21) / 31 = (200000 + 630000) / 31 = 830000/31 = 26774.19...
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-03-11', 30000)];
  const result = proRatedSalary('2024-03-01', '2024-03-31', history);
  assert.equal(result, Math.round((20000 * 10 + 30000 * 21) / 31));
});

test('proRatedSalary: raise on first day of period uses new salary entirely', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-03-01', 35000)];
  assert.equal(proRatedSalary('2024-03-01', '2024-03-31', history), 35000);
});

test('proRatedSalary: raise after period end uses old salary entirely', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-04-01', 35000)];
  assert.equal(proRatedSalary('2024-03-01', '2024-03-31', history), 20000);
});

// ── getSalarySlices ───────────────────────────────────────────────────────────

test('getSalarySlices: single salary returns one slice', () => {
  const history = [makeEntry('2024-01-01', 30000)];
  const slices = getSalarySlices('2024-03-01', '2024-03-31', history);
  assert.equal(slices.length, 1);
  assert.equal(slices[0].from, '2024-03-01');
  assert.equal(slices[0].to, '2024-03-31');
  assert.equal(slices[0].salaryMinor, 30000);
});

test('getSalarySlices: mid-month raise returns two slices', () => {
  const history = [makeEntry('2024-01-01', 20000), makeEntry('2024-03-11', 30000)];
  const slices = getSalarySlices('2024-03-01', '2024-03-31', history);
  assert.equal(slices.length, 2);
  assert.equal(slices[0].from, '2024-03-01');
  assert.equal(slices[0].to, '2024-03-10');
  assert.equal(slices[0].salaryMinor, 20000);
  assert.equal(slices[1].from, '2024-03-11');
  assert.equal(slices[1].to, '2024-03-31');
  assert.equal(slices[1].salaryMinor, 30000);
});
