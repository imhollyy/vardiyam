import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { initializeDatabase } from '../../src/data/database.ts';
import { getOnboardingState, getReportsRewardState, getThemePreference, saveOnboardingState, saveReportsRewardState, saveThemePreference } from '../../src/data/appPreferencesRepository.ts';

function adapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) { sqlite.exec('BEGIN;'); try { await callback(); sqlite.exec('COMMIT;'); } catch (error) { sqlite.exec('ROLLBACK;'); throw error; } },
  };
}

test('onboarding steps, theme, and reports preview state persist locally across database reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-preferences-'));
  const path = join(directory, 'preferences.db');
  const sqlite = new DatabaseSync(path);
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    assert.deepEqual(await getOnboardingState(database), { step: 0, completed: false });
    await saveOnboardingState(database, { step: 2, completed: false });
    await saveThemePreference(database, 'dark');
    const reward = { expiresAtUtc: '2026-11-06T12:00:00.000Z', lastUsedLocalDate: '2026-11-05' };
    await saveReportsRewardState(database, reward);
    sqlite.close();
    const reopened = new DatabaseSync(path);
    const reopenedDatabase = adapter(reopened);
    assert.deepEqual(await getOnboardingState(reopenedDatabase), { step: 2, completed: false });
    assert.equal(await getThemePreference(reopenedDatabase), 'dark');
    assert.deepEqual(await getReportsRewardState(reopenedDatabase), reward);
    reopened.close();
  } finally {
    try { sqlite.close(); } catch { /* Database already closed to verify on-disk persistence. */ }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('existing configured installs skip onboarding when no onboarding preference exists', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    sqlite.prepare("INSERT INTO shift_cycles(id,name,timezone,anchor_local_date,start_index,entry_count) VALUES('cycle1','Test','Europe/Istanbul','2026-11-05',0,1)").run();
    assert.deepEqual(await getOnboardingState(database), { step: 0, completed: true });
  } finally { sqlite.close(); }
});

test('an existing work-only installation skips onboarding and preserves its records', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    sqlite.prepare("INSERT INTO work_records(id,record_source,started_at_utc,ended_at_utc,timezone,break_minutes) VALUES('work-only','MANUAL','2026-11-05T05:00:00.000Z','2026-11-05T06:00:00.000Z','Europe/Istanbul',0)").run();
    assert.deepEqual(await getOnboardingState(database), { step: 0, completed: true });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM work_records WHERE id='work-only'").get().count, 1);
  } finally { sqlite.close(); }
});
