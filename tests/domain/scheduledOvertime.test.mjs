import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { saveShiftSchedule, listShiftCycles, listShiftTemplates } from '../../src/data/shiftCycleRepository.ts';
import {
  resolvePlannedTemplates,
  deriveDays,
  generateMonthlyStatement,
} from '../../src/domain/payroll/index.ts';

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

const DAY_TEMPLATE = {
  id: 'tpl-day',
  code: 'D',
  name: 'Gündüz',
  startLocalTime: '08:00',
  endLocalTime: '17:00', // 540 nominal − 30 break = 510 net
  breakMinutes: 30,
  standardMinutes: 540,
};

const LONG_TEMPLATE = {
  id: 'tpl-long',
  code: 'L',
  name: 'Uzun',
  startLocalTime: '07:00',
  endLocalTime: '19:00', // 720 nominal − 30 break = 690 net → heavy overtime
  breakMinutes: 30,
  standardMinutes: 720,
};

const BASE_SETTINGS = {
  salaryMinor: 2_000_000,
  salaryType: 'GROSS',
  payday: '15',
  workSchedule: 'EVERY_DAY',
  startDate: '2026-01-01',
  besEnabled: false,
  besRateBp: 0,
};

// 7-day repeating cycle, same SHIFT every day
const EVERY_DAY_CYCLE = {
  id: 'cycle-every',
  name: 'Her Gün',
  timezone: 'Europe/Istanbul',
  anchorLocalDate: '2026-01-05',
  startIndex: 0,
  entries: Array.from({ length: 7 }, () => ({ kind: 'SHIFT', templateId: 'tpl-day' })),
};

// ---------------------------------------------------------------------------
// resolvePlannedTemplates — pure function tests
// ---------------------------------------------------------------------------

test('resolvePlannedTemplates: returns null for dates before cycle effectiveFrom', () => {
  const cycle = { ...EVERY_DAY_CYCLE, effectiveFrom: '2026-02-01' };
  const dates = ['2026-01-15', '2026-01-16', '2026-02-01', '2026-02-02'];
  const result = resolvePlannedTemplates(dates, [cycle], [DAY_TEMPLATE], new Map());
  assert.equal(result.get('2026-01-15'), null);
  assert.equal(result.get('2026-01-16'), null);
  assert.equal(result.get('2026-02-01'), 'tpl-day');
  assert.equal(result.get('2026-02-02'), 'tpl-day');
});

test('resolvePlannedTemplates: shiftOverrideId takes priority over cycle', () => {
  const cycle = { ...EVERY_DAY_CYCLE, effectiveFrom: '2026-01-01' };
  const entries = new Map([['2026-11-17', {
    shiftOverrideId: 'tpl-long', overtimeMinutes: 0, lateEarlyMinutes: 0,
    leaveType: null, leaveHalfDay: false, leaveHours: 0, deductOverride: null, note: null,
  }]]);
  const dates = ['2026-11-16', '2026-11-17', '2026-11-18'];
  const result = resolvePlannedTemplates(dates, [cycle], [DAY_TEMPLATE, LONG_TEMPLATE], entries);
  assert.equal(result.get('2026-11-16'), 'tpl-day');
  assert.equal(result.get('2026-11-17'), 'tpl-long');
  assert.equal(result.get('2026-11-18'), 'tpl-day');
});

test('resolvePlannedTemplates: OFF cycle entry resolves to null', () => {
  const offCycle = {
    id: 'cycle-off', name: 'Off', timezone: 'Europe/Istanbul',
    anchorLocalDate: '2026-11-17', startIndex: 0, effectiveFrom: '2026-01-01',
    entries: [{ kind: 'OFF' }, { kind: 'SHIFT', templateId: 'tpl-day' }],
  };
  const dates = ['2026-11-17', '2026-11-18'];
  const result = resolvePlannedTemplates(dates, [offCycle], [DAY_TEMPLATE], new Map());
  assert.equal(result.get('2026-11-17'), null, 'OFF entry should resolve to null');
  assert.equal(result.get('2026-11-18'), 'tpl-day');
});

test('resolvePlannedTemplates: empty cycles returns null for all dates', () => {
  const dates = ['2026-11-17', '2026-11-18'];
  const result = resolvePlannedTemplates(dates, [], [DAY_TEMPLATE], new Map());
  assert.equal(result.get('2026-11-17'), null);
  assert.equal(result.get('2026-11-18'), null);
});

test('resolvePlannedTemplates: latest effective_from wins when multiple cycles', () => {
  const c1 = { ...EVERY_DAY_CYCLE, id: 'c1', effectiveFrom: '2026-01-01',
    entries: [{ kind: 'SHIFT', templateId: 'tpl-day' }] };
  const c2 = { ...EVERY_DAY_CYCLE, id: 'c2', effectiveFrom: '2026-06-01',
    entries: [{ kind: 'SHIFT', templateId: 'tpl-long' }] };
  const result = resolvePlannedTemplates(
    ['2026-05-31', '2026-06-01', '2026-07-01'],
    [c1, c2], [DAY_TEMPLATE, LONG_TEMPLATE], new Map(),
  );
  assert.equal(result.get('2026-05-31'), 'tpl-day', 'before c2.effectiveFrom → c1 wins');
  assert.equal(result.get('2026-06-01'), 'tpl-long', 'on c2.effectiveFrom → c2 wins');
  assert.equal(result.get('2026-07-01'), 'tpl-long', 'after c2.effectiveFrom → c2 wins');
});

// ---------------------------------------------------------------------------
// deriveDays with cycles
// ---------------------------------------------------------------------------

test('deriveDays: shiftTemplateId comes from cycle when no shiftOverrideId', () => {
  const cycle = { ...EVERY_DAY_CYCLE, effectiveFrom: '2026-01-01' };
  const settings = { ...BASE_SETTINGS };
  const dates = ['2026-11-17', '2026-11-18'];
  const derived = deriveDays(dates, new Map(), settings, [DAY_TEMPLATE], [cycle]);
  assert.equal(derived[0]?.shiftTemplateId, 'tpl-day');
  assert.equal(derived[1]?.shiftTemplateId, 'tpl-day');
});

test('deriveDays: shiftTemplateId null for all days without cycles', () => {
  const settings = { ...BASE_SETTINGS };
  const derived = deriveDays(['2026-11-17', '2026-11-18'], new Map(), settings, [DAY_TEMPLATE], []);
  assert.equal(derived[0]?.shiftTemplateId, null);
  assert.equal(derived[1]?.shiftTemplateId, null);
});

// ---------------------------------------------------------------------------
// generateMonthlyStatement with DB-persisted cycles (end-to-end)
// ---------------------------------------------------------------------------

test('scheduledOvertimeMinutes > 0 when cycle provides 7-day × 510 net min schedule', async () => {
  // 510 net/day × 7 days/week = 3570 > 2700 limit → overtime every week
  const { sqlite, database } = await setup();
  try {
    await saveShiftSchedule(database, [DAY_TEMPLATE], EVERY_DAY_CYCLE, '2026-01-01');
    const templates = await listShiftTemplates(database);
    const cycles = await listShiftCycles(database);
    const settings = { ...BASE_SETTINGS };
    const stmt = generateMonthlyStatement(settings, new Map(), [], 2026, 11, 0, templates, cycles);
    assert.ok(stmt.scheduledOvertimeMinutes > 0,
      `expected > 0 scheduled overtime, got ${stmt.scheduledOvertimeMinutes}`);
  } finally { sqlite.close(); }
});

test('scheduledOvertimeMinutes is 0 when no cycles passed', () => {
  const settings = { ...BASE_SETTINGS };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2026, 11, 0, [DAY_TEMPLATE], []);
  assert.equal(stmt.scheduledOvertimeMinutes, 0);
});

test('grossMinor exceeds base salary when scheduled overtime present', async () => {
  const { sqlite, database } = await setup();
  try {
    await saveShiftSchedule(database, [LONG_TEMPLATE], {
      ...EVERY_DAY_CYCLE, id: 'cycle-long',
      entries: Array.from({ length: 7 }, () => ({ kind: 'SHIFT', templateId: 'tpl-long' })),
    }, '2026-01-01');
    const templates = await listShiftTemplates(database);
    const cycles = await listShiftCycles(database);
    const settings = { ...BASE_SETTINGS };
    const stmt = generateMonthlyStatement(settings, new Map(), [], 2026, 11, 0, templates, cycles);
    assert.ok(stmt.grossMinor > settings.salaryMinor,
      `gross ${stmt.grossMinor} should exceed base ${settings.salaryMinor}`);
  } finally { sqlite.close(); }
});
