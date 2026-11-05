import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { calculateGrossEarnings, createDefaultEarningsRules } from '../../src/domain/earnings.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { appendEarningsProfileVersion, getLatestEarningsProfile, listApprovedEarningsSnapshots, saveApprovedEarningsSnapshot, EarningsStorageError } from '../../src/data/earningsRepository.ts';

function adapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) { sqlite.exec('BEGIN;'); try { await callback(); sqlite.exec('COMMIT;'); } catch (error) { sqlite.exec('ROLLBACK;'); throw error; } },
  };
}

function completeResult() {
  const rules = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', 'MONTHLY_GROSS');
  const result = calculateGrossEarnings({
    calculationId: 'synthetic-approved-1', calculatedAtUtc: '2026-01-10T00:00:00.000Z',
    payProfile: { mode: 'MONTHLY_GROSS', currency: 'TRY', monthlyGrossMinor: 4_500_000, monthlyDivider: { minutes: 13_500, confirmed: true, source: 'synthetic explicit approval' } },
    ruleSet: { profileId: 'default', versionId: 'rules-v1', timezone: 'Europe/Istanbul', weekStartsOn: 1, payrollPeriodStartDay: 1,
      rules, contract: { versionId: 'contract-v1', weeklyMinutes: 2_700, effectiveFromUtc: '2026-01-01T00:00:00.000Z', effectiveToUtc: null, averagingOrEqualizationUnclear: false },
      holidayDataset: { versionId: 'synthetic-holiday-v1', source: 'synthetic test', coveredFromUtc: '2025-01-01T00:00:00.000Z', coveredToUtc: '2027-01-01T00:00:00.000Z', windows: [] },
      workplaceRestWindows: [], workplaceHolidayWindows: [], includedBasePolicyConfirmed: true },
    records: [{ id: 'synthetic-work', startedAtUtc: '2026-01-05T05:00:00.000Z', endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 }],
    completeWeekStarts: ['2026-01-05'],
  });
  assert.equal(result.status, 'COMPLETE');
  return result;
}

const sourceInput = {
  sourceRangeStartUtc: '2026-01-05T00:00:00.000Z', sourceRangeEndUtc: '2026-01-12T00:00:00.000Z',
  records: [{ id: 'synthetic-work', startedAtUtc: '2026-01-05T05:00:00.000Z', endedAtUtc: '2026-01-05T06:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0, timedBreakIntervals: [] }],
};

function insertSource(sqlite) {
  sqlite.prepare(`INSERT INTO work_records(id, record_source, started_at_utc, ended_at_utc, timezone, break_minutes)
    VALUES ('synthetic-work', 'MANUAL', '2026-01-05T05:00:00.000Z', '2026-01-05T06:00:00.000Z', 'Europe/Istanbul', 0)`).run();
}

test('profile and rules append new versions and keep old values readable', async () => {
  const sqlite = new DatabaseSync(':memory:'); const database = adapter(sqlite);
  try {
    await initializeDatabase(database);
    const first = await appendEarningsProfileVersion(database, 'default', { mode: 'SKIP' }, [], 'rules-v1', '2026-01-01T00:00:00.000Z');
    const second = await appendEarningsProfileVersion(database, 'default', { mode: 'HOURLY_GROSS' }, [], 'rules-v2', '2026-01-02T00:00:00.000Z');
    assert.equal(first.profileVersion, 1); assert.equal(second.profileVersion, 2);
    assert.equal((await getLatestEarningsProfile(database, 'default')).profile.mode, 'HOURLY_GROSS');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earnings_profiles').get().n, 2);
    await assert.rejects(appendEarningsProfileVersion(database, 'default', { mode: 'SKIP' }, [], 'rules-v2', '2026-01-03T00:00:00.000Z'));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earnings_profiles').get().n, 2, 'failed second insert rolls back the profile version');
  } finally { sqlite.close(); }
});

test('only a complete fresh preview can be explicitly saved and saved snapshot is immutable', async () => {
  const sqlite = new DatabaseSync(':memory:'); const database = adapter(sqlite);
  try {
    await initializeDatabase(database);
    const rules = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', 'MONTHLY_GROSS');
    const profile = await appendEarningsProfileVersion(database, 'default', { mode: 'MONTHLY_GROSS' }, rules, 'rules-v1', '2026-01-01T00:00:00.000Z');
    insertSource(sqlite);
    const result = completeResult();
    await saveApprovedEarningsSnapshot(database, { calculationId: result.snapshot.calculationId, createdAtUtc: result.snapshot.calculatedAtUtc,
      profileId: 'default', profileVersion: profile.profileVersion, ruleVersionId: profile.ruleVersionId, input: { ...sourceInput, copiedSettings: { mode: 'MONTHLY_GROSS' }, copiedRules: rules }, result });
    await assert.rejects(() => database.runAsync('UPDATE earnings_snapshots SET total_amount_minor = 1'), /immutable/);
    await assert.rejects(() => database.runAsync('DELETE FROM earnings_snapshots'), /immutable/);
    const saved = await listApprovedEarningsSnapshots(database);
    assert.equal(saved.length, 1); assert.equal(saved[0].result.snapshot.calculationId, result.snapshot.calculationId);
    assert.equal(saved[0].result.totalAmountMinor, result.totalAmountMinor);
    await appendEarningsProfileVersion(database, 'default', { mode: 'HOURLY_GROSS', hourlyGrossMinor: 20_000 }, rules, 'rules-v2', '2026-02-01T00:00:00.000Z');
    const afterProfileChange = await listApprovedEarningsSnapshots(database);
    assert.equal(afterProfileChange[0].result.totalAmountMinor, result.totalAmountMinor, 'new settings do not rewrite a previously-approved result');
    await assert.rejects(saveApprovedEarningsSnapshot(database, { calculationId: 'bad', createdAtUtc: '2026-01-10T00:00:00.000Z', profileId: 'default', profileVersion: profile.profileVersion, ruleVersionId: profile.ruleVersionId, input: {}, result: { ...result, status: 'PARTIAL' } }), (error) => error instanceof EarningsStorageError && error.code === 'INCOMPLETE_SNAPSHOT');
  } finally { sqlite.close(); }
});

test('calculation preview remains write-free until explicit snapshot approval', async () => {
  const sqlite = new DatabaseSync(':memory:'); const database = adapter(sqlite);
  try {
    await initializeDatabase(database);
    const result = completeResult();
    assert.equal(result.status, 'COMPLETE');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earnings_snapshots').get().n, 0);
  } finally { sqlite.close(); }
});

test('snapshot approval rejects stale previews after a profile version changes', async () => {
  const sqlite = new DatabaseSync(':memory:'); const database = adapter(sqlite);
  try {
    await initializeDatabase(database);
    const rules = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', 'MONTHLY_GROSS');
    const first = await appendEarningsProfileVersion(database, 'default', { mode: 'MONTHLY_GROSS' }, rules, 'rules-v1', '2026-01-01T00:00:00.000Z');
    insertSource(sqlite);
    const result = completeResult();
    await appendEarningsProfileVersion(database, 'default', { mode: 'MONTHLY_GROSS', revision: 2 }, rules, 'rules-v2', '2026-01-02T00:00:00.000Z');
    await assert.rejects(saveApprovedEarningsSnapshot(database, { calculationId: result.snapshot.calculationId, createdAtUtc: result.snapshot.calculatedAtUtc,
      profileId: 'default', profileVersion: first.profileVersion, ruleVersionId: first.ruleVersionId, input: { ...sourceInput, copiedSettings: { mode: 'MONTHLY_GROSS' }, copiedRules: rules }, result }), (error) => error instanceof EarningsStorageError && error.code === 'STALE_PREVIEW');
  } finally { sqlite.close(); }
});

test('approved snapshots survive SQLite cold reopen with copied provenance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-earnings-'));
  const path = join(directory, 'earnings.db');
  let sqlite = new DatabaseSync(path);
  try {
    let database = adapter(sqlite);
    await initializeDatabase(database);
    const rules = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', 'MONTHLY_GROSS');
    const profile = await appendEarningsProfileVersion(database, 'default', { mode: 'MONTHLY_GROSS', syntheticPay: 4_500_000 }, rules, 'rules-v1', '2026-01-01T00:00:00.000Z');
    const result = completeResult();
    insertSource(sqlite);
    const provenance = { ...sourceInput, sourceRecordIds: ['synthetic-work'], copiedSettings: profile.profile, copiedRules: profile.rules, profileCopy: profile.profile };
    await saveApprovedEarningsSnapshot(database, { calculationId: result.snapshot.calculationId, createdAtUtc: result.snapshot.calculatedAtUtc,
      profileId: 'default', profileVersion: profile.profileVersion, ruleVersionId: profile.ruleVersionId, input: provenance, result });
    sqlite.close();
    sqlite = new DatabaseSync(path); database = adapter(sqlite);
    await initializeDatabase(database);
    const saved = await listApprovedEarningsSnapshots(database);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].input, provenance);
    assert.equal(saved[0].result.totalAmountMinor, result.totalAmountMinor);
  } finally { sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('snapshot approval rejects work-record edits made after the preview', async () => {
  const sqlite = new DatabaseSync(':memory:'); const database = adapter(sqlite);
  try {
    await initializeDatabase(database);
    const rules = createDefaultEarningsRules('2026-01-01T00:00:00.000Z', 'MONTHLY_GROSS');
    const profile = await appendEarningsProfileVersion(database, 'default', { mode: 'MONTHLY_GROSS' }, rules, 'rules-v1', '2026-01-01T00:00:00.000Z');
    insertSource(sqlite);
    sqlite.prepare("UPDATE work_records SET ended_at_utc='2026-01-05T07:00:00.000Z' WHERE id='synthetic-work'").run();
    const result = completeResult();
    await assert.rejects(saveApprovedEarningsSnapshot(database, { calculationId: result.snapshot.calculationId, createdAtUtc: result.snapshot.calculatedAtUtc,
      profileId: 'default', profileVersion: profile.profileVersion, ruleVersionId: profile.ruleVersionId, input: { ...sourceInput, copiedSettings: { mode: 'MONTHLY_GROSS' }, copiedRules: rules }, result }),
    (error) => error instanceof EarningsStorageError && error.code === 'STALE_SOURCE');
  } finally { sqlite.close(); }
});
