/**
 * Tests for initial setup effectiveFrom calculation and backward cycle projection.
 *
 * Scenario: payday=LAST, setup date=2026-11-23 (Monday)
 *   - Pay period: 2026-11-01 → 2026-11-30
 *   - effectiveFrom should be Monday of Nov 1's week = 2026-10-26
 *   - MON_FRI FIXED_DAY 08:00–20:00 break=60: net=720−60=660 min/day × 5=3300/wk > 2700 → 600 OT/wk
 *   - 4 full weeks (Nov 2, 9, 16, 23) + Nov 30 partial = 4×600 + 120 = 2520 min = 42 h
 *   - TWO_SHIFT this week = night → Nov 16–20 day, Nov 9–13 night
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { saveShiftSchedule, listShiftCycles, listShiftTemplates } from '../../src/data/shiftCycleRepository.ts';
import { getPayPeriodForDate, resolvePlannedTemplates, generateMonthlyStatement } from '../../src/domain/payroll/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAdapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) {
      sqlite.exec('BEGIN;');
      try { await callback(); sqlite.exec('COMMIT;'); }
      catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
    },
  };
}

async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const database = createAdapter(sqlite);
  await initializeDatabase(database);
  return { sqlite, database };
}

function mondayOfDate(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  date.setDate(d + (dow === 0 ? -6 : 1 - dow));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// MON_FRI FIXED_DAY 08:00–20:00 break=60 → net = 720−60 = 660 min/day
const DAY_TEMPLATE = {
  id: 'tpl-day', code: 'D', name: 'Gündüz',
  startLocalTime: '08:00', endLocalTime: '20:00',
  breakMinutes: 60, standardMinutes: 720,
};

const NIGHT_TEMPLATE = {
  id: 'tpl-night', code: 'N', name: 'Gece',
  startLocalTime: '20:00', endLocalTime: '08:00',
  breakMinutes: 60, standardMinutes: 720,
};

// MON_FRI: 5 work + 2 off per group
const MON_FRI_FIXED_CYCLE = {
  id: 'cycle-fixed', name: 'Sabit Gündüz', timezone: 'Europe/Istanbul',
  anchorLocalDate: '2026-11-23', startIndex: 0,
  entries: [
    ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'tpl-day' })),
    { kind: 'OFF' }, { kind: 'OFF' },
  ],
};

// TWO_SHIFT: [D×5, OFF×2, N×5, OFF×2], night = startIndex 7
const MON_FRI_TWO_SHIFT_CYCLE = {
  id: 'cycle-two', name: 'İki Vardiya', timezone: 'Europe/Istanbul',
  anchorLocalDate: '2026-11-23', startIndex: 7,
  entries: [
    ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'tpl-day' })),
    { kind: 'OFF' }, { kind: 'OFF' },
    ...Array.from({ length: 5 }, () => ({ kind: 'SHIFT', templateId: 'tpl-night' })),
    { kind: 'OFF' }, { kind: 'OFF' },
  ],
};

const BASE_SETTINGS = {
  salaryMinor: 3_000_000, salaryType: 'GROSS', payday: 'LAST',
  workSchedule: 'MON_FRI', shiftPattern: 'FIXED_DAY',
  startDate: null, besEnabled: false, besRateBp: 0,
};

// ---------------------------------------------------------------------------
// Pure computation: effectiveFrom derivation
// ---------------------------------------------------------------------------

test('effectiveFrom = Monday of period start\'s week (payday=LAST, 2026-11-23)', () => {
  const { start } = getPayPeriodForDate('2026-11-23', 'LAST');
  assert.equal(start, '2026-11-01', 'payday=LAST Nov period starts Nov 1');
  // Nov 1, 2026 is Sunday → Monday of that week = Oct 26
  const effectiveFrom = mondayOfDate(start);
  assert.equal(effectiveFrom, '2026-10-26');
});

test('effectiveFrom = anchor when period starts on a Monday (payday=15, 2026-11-23)', () => {
  const { start } = getPayPeriodForDate('2026-11-23', '15');
  assert.equal(start, '2026-11-16', '2026-11-16 is Monday');
  assert.equal(mondayOfDate(start), '2026-11-16');
});

// ---------------------------------------------------------------------------
// FIXED_DAY backward projection with extended effectiveFrom
// ---------------------------------------------------------------------------

test('FIXED_DAY effectiveFrom=2026-10-26: cycle resolves from Nov 1', () => {
  const cycle = { ...MON_FRI_FIXED_CYCLE, effectiveFrom: '2026-10-26' };
  const dates = ['2026-11-02', '2026-11-03', '2026-11-07', '2026-11-30'];
  const result = resolvePlannedTemplates(dates, [cycle], [DAY_TEMPLATE], new Map());
  assert.equal(result.get('2026-11-02'), 'tpl-day', 'Nov 2 (Mon) = work day in cycle');
  assert.equal(result.get('2026-11-03'), 'tpl-day', 'Nov 3 (Tue) = work day in cycle');
  assert.equal(result.get('2026-11-07'), null, 'Nov 7 (Sat) = OFF entry in MON_FRI cycle');
  assert.equal(result.get('2026-11-30'), 'tpl-day', 'Nov 30 (Mon) = work day in cycle');
});

test('FIXED_DAY effectiveFrom=anchor (2026-11-23): pre-anchor dates resolve null', () => {
  const cycle = { ...MON_FRI_FIXED_CYCLE, effectiveFrom: '2026-11-23' };
  const result = resolvePlannedTemplates(
    ['2026-11-02', '2026-11-16', '2026-11-23'],
    [cycle], [DAY_TEMPLATE], new Map(),
  );
  assert.equal(result.get('2026-11-02'), null, 'Nov 2 before effectiveFrom → null');
  assert.equal(result.get('2026-11-16'), null, 'Nov 16 before effectiveFrom → null');
  assert.equal(result.get('2026-11-23'), 'tpl-day', 'Nov 23 on effectiveFrom → tpl-day');
});

// ---------------------------------------------------------------------------
// TWO_SHIFT backward projection
// ---------------------------------------------------------------------------

test('TWO_SHIFT this week=night: Nov 16–20 day, Nov 9–13 night', () => {
  const cycle = { ...MON_FRI_TWO_SHIFT_CYCLE, effectiveFrom: '2026-10-26' };
  const dates = [
    '2026-11-09', '2026-11-10', '2026-11-13', // 2 weeks ago Mon–Fri → night
    '2026-11-16', '2026-11-17', '2026-11-20', // last week Mon–Fri → day
    '2026-11-23', '2026-11-24', '2026-11-27', // this week Mon–Fri → night
  ];
  const result = resolvePlannedTemplates(dates, [cycle], [DAY_TEMPLATE, NIGHT_TEMPLATE], new Map());
  assert.equal(result.get('2026-11-09'), 'tpl-night', 'Nov 9 (2 wk ago Mon) = night');
  assert.equal(result.get('2026-11-10'), 'tpl-night', 'Nov 10 (2 wk ago Tue) = night');
  assert.equal(result.get('2026-11-13'), 'tpl-night', 'Nov 13 (2 wk ago Fri) = night');
  assert.equal(result.get('2026-11-16'), 'tpl-day', 'Nov 16 (prev Mon) = day');
  assert.equal(result.get('2026-11-17'), 'tpl-day', 'Nov 17 (prev Tue) = day');
  assert.equal(result.get('2026-11-20'), 'tpl-day', 'Nov 20 (prev Fri) = day');
  assert.equal(result.get('2026-11-23'), 'tpl-night', 'Nov 23 (this Mon) = night');
  assert.equal(result.get('2026-11-24'), 'tpl-night', 'Nov 24 (this Tue) = night');
  assert.equal(result.get('2026-11-27'), 'tpl-night', 'Nov 27 (this Fri) = night');
});

// ---------------------------------------------------------------------------
// generateMonthlyStatement end-to-end: 42 h scheduled OT for November
// ---------------------------------------------------------------------------

test('Kasım 2026 FIXED_DAY effectiveFrom=2026-10-26 → 2520 min (42 h) scheduled OT', async () => {
  // Weekly: 5 × 660 = 3300 min > 2700 → 600 OT/week
  // Week Nov 2 (Nov 2-6): 5 days in period → 600
  // Week Nov 9 (Nov 9-13): 5 days in period → 600
  // Week Nov 16 (Nov 16-20): 5 days in period → 600
  // Week Nov 23 (Nov 23-27): 5 days in period → 600
  // Week Nov 30 (Nov 30 – Dec 6): 5 work days total, only Nov 30 in period → 600÷5=120
  // Total: 4×600 + 120 = 2520 min = 42 h
  const { sqlite, database } = await setup();
  try {
    await saveShiftSchedule(database, [DAY_TEMPLATE], MON_FRI_FIXED_CYCLE, '2026-10-26');
    const templates = await listShiftTemplates(database);
    const cycles = await listShiftCycles(database);
    const stmt = generateMonthlyStatement(BASE_SETTINGS, new Map(), [], 2026, 11, 0, templates, cycles);
    assert.equal(stmt.scheduledOvertimeMinutes, 2520,
      `Expected 2520 min (42 h), got ${stmt.scheduledOvertimeMinutes}`);
  } finally { sqlite.close(); }
});

test('Kasım 2026 FIXED_DAY effectiveFrom=2026-11-23 (old behavior) → only 720 min OT', async () => {
  // With effectiveFrom=anchor, only weeks from Nov 23 get templates.
  // Week Nov 23: 5 days × 660 = 3300 → 600 OT (all in period)
  // Week Nov 30: 1 day in period → 120 OT
  // Earlier weeks: null templates → 0 OT
  const { sqlite, database } = await setup();
  try {
    await saveShiftSchedule(database, [DAY_TEMPLATE], MON_FRI_FIXED_CYCLE, '2026-11-23');
    const templates = await listShiftTemplates(database);
    const cycles = await listShiftCycles(database);
    const stmt = generateMonthlyStatement(BASE_SETTINGS, new Map(), [], 2026, 11, 0, templates, cycles);
    assert.equal(stmt.scheduledOvertimeMinutes, 720,
      `With anchor-only effectiveFrom, expected 720 min, got ${stmt.scheduledOvertimeMinutes}`);
  } finally { sqlite.close(); }
});
