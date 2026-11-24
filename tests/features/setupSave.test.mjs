import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { updateSettings, markSetupCompleted, getSettings } from '../../src/data/settingsRepository.ts';
import { saveShiftSchedule } from '../../src/data/shiftCycleRepository.ts';
import { getPayPeriodForDate } from '../../src/domain/payroll/index.ts';
import { PAYDAY_LAST } from '../../src/domain/payroll/types.ts';
import { buildSetupPayload, parseSetupStartDate, mondayOfLocalDate } from '../../src/features/setup/buildSetupPayload.ts';

function adapter(database) {
  // Expo SQLite calls runAsync/getFirstAsync/getAllAsync as (sql, paramsArray) where
  // paramsArray is a flat array of positional values. node:sqlite needs them spread.
  function flatArgs(params) {
    return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  }
  return {
    async execAsync(sql) { database.exec(sql); },
    async getFirstAsync(sql, ...params) { return database.prepare(sql).get(...flatArgs(params)) ?? null; },
    async getAllAsync(sql, ...params) { return database.prepare(sql).all(...flatArgs(params)); },
    async runAsync(sql, ...params) { return database.prepare(sql).run(...flatArgs(params)); },
    async withTransactionAsync(callback) {
      database.exec('BEGIN;');
      try { await callback(); database.exec('COMMIT;'); } catch (error) { database.exec('ROLLBACK;'); throw error; }
    },
  };
}

async function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  const db = adapter(sqlite);
  await initializeDatabase(db);
  return { sqlite, db };
}

// ─── domain ──────────────────────────────────────────────────────────────────

test('getPayPeriodForDate 2026-11-24 ile LAST → kasım dönemini döndürür', () => {
  const { start, end } = getPayPeriodForDate('2026-11-24', PAYDAY_LAST);
  assert.equal(start, '2026-11-01');
  assert.equal(end, '2026-11-30');
});

test('getPayPeriodForDate ay sonu geçilince sonraki aya geçer', () => {
  const { start, end } = getPayPeriodForDate('2026-12-01', PAYDAY_LAST);
  assert.equal(start, '2026-12-01');
  assert.equal(end, '2026-12-31');
});

// ─── veritabanı CHECK kısıtı ─────────────────────────────────────────────────

test("'LAST' payday değeri CHECK kısıtını geçer", async () => {
  const { db } = await freshDb();
  await assert.doesNotReject(() => updateSettings(db, { payday: 'LAST' }));
  const s = await getSettings(db);
  assert.equal(s.payday, 'LAST');
});

test("küçük harf 'last' CHECK kısıtı tarafından reddedilir", async () => {
  const { db } = await freshDb();
  await assert.rejects(() => updateSettings(db, { payday: 'last' }));
});

test("sayısal payday '15' CHECK kısıtını geçer", async () => {
  const { db } = await freshDb();
  await assert.doesNotReject(() => updateSettings(db, { payday: '15' }));
});

// ─── buildSetupPayload ───────────────────────────────────────────────────────

const SAMPLE_DRAFT = {
  salaryText: '30.000',
  salaryType: 'GROSS',
  payday: PAYDAY_LAST,
  besEnabled: false,
  besRateBp: '300',
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  templateDrafts: [
    { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
  ],
  currentShiftIndex: 0,
  startDate: '2022-03-15',
};

test('buildSetupPayload saf dönüşümü doğru üretir', () => {
  const payload = buildSetupPayload(SAMPLE_DRAFT, ['tmpl-1'], 'cycle-1', '2026-11-24');

  assert.equal(payload.payday, PAYDAY_LAST);
  assert.equal(payload.salaryMinor, 3_000_000);
  assert.equal(payload.startDate, '2022-03-15');
  assert.equal(payload.templates.length, 1);
  assert.equal(payload.templates[0].id, 'tmpl-1');
  assert.equal(payload.cycle.id, 'cycle-1');
  assert.equal(payload.cycle.entries.length, 7); // 5 SHIFT + 2 OFF for MON_FRI
  assert.equal(payload.effectiveFrom, mondayOfLocalDate('2026-11-01'));
});

test('buildSetupPayload FIXED_DAY MON_FRI: 5 SHIFT + 2 OFF döngüsü', () => {
  const payload = buildSetupPayload(SAMPLE_DRAFT, ['t1'], 'c1', '2026-11-24');
  const kinds = payload.cycle.entries.map((e) => e.kind);
  assert.deepEqual(kinds, ['SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'OFF', 'OFF']);
});

// ─── tam kurulum kayıt akışı (entegrasyon) ───────────────────────────────────

test('kurulum akışı: updateSettings(LAST) + saveShiftSchedule + markSetupCompleted başarılı', async () => {
  const { db } = await freshDb();
  const payload = buildSetupPayload(SAMPLE_DRAFT, ['tmpl-uuid-1'], 'cycle-uuid-1', '2026-11-24');

  await updateSettings(db, {
    salaryMinor: payload.salaryMinor,
    salaryType: payload.salaryType,
    payday: payload.payday,
    workSchedule: payload.workSchedule,
    shiftPattern: payload.shiftPattern,
    besEnabled: payload.besEnabled,
    besRateBp: payload.besRateBp,
    startDate: payload.startDate,
  });
  await saveShiftSchedule(db, payload.templates, payload.cycle, payload.effectiveFrom);
  await markSetupCompleted(db);

  const saved = await getSettings(db);
  assert.equal(saved.payday, PAYDAY_LAST);
  assert.equal(saved.setupCompleted, true);
  assert.equal(saved.salaryMinor, 3_000_000);
});

// ─── yardımcı fonksiyonlar ───────────────────────────────────────────────────

test('parseSetupStartDate GG.AA.YYYY → YYYY-MM-DD', () => {
  assert.equal(parseSetupStartDate('15.03.2022'), '2022-03-15');
  assert.equal(parseSetupStartDate('01.01.2020'), '2020-01-01');
  assert.equal(parseSetupStartDate(''), null);
  assert.equal(parseSetupStartDate('   '), null);
});

test('mondayOfLocalDate pazartesiyi doğru bulur', () => {
  assert.equal(mondayOfLocalDate('2026-11-24'), '2026-11-23'); // salı → pazartesi
  assert.equal(mondayOfLocalDate('2026-11-23'), '2026-11-23'); // pazartesi → pazartesi
  assert.equal(mondayOfLocalDate('2026-11-29'), '2026-11-23'); // pazar → önceki pazartesi
});
