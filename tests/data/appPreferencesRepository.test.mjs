/**
 * Tests for appPreferencesRepository.ts — theme, onboarding state, schedule draft.
 * Tests referencing work_records / earnings_profiles / earningsRepository removed:
 * those tables were part of old schema (v1-9) and do not exist in v100.
 * User instruction: "Phase 4: test cleanup → 0 test failures"
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { initializeDatabase } from '../../src/data/database.ts';
import {
  clearOnboardingScheduleDraft,
  getOnboardingScheduleDraft,
  getOnboardingState,
  getReportsRewardState,
  getThemePreference,
  saveOnboardingScheduleDraft,
  saveOnboardingState,
  saveReportsRewardState,
  saveThemePreference,
} from '../../src/data/appPreferencesRepository.ts';
import { previewNext30Days } from '../../src/features/onboarding/scheduleDraft.ts';

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

test('onboarding draft and preview step survive a cold SQLite reopen and can be cleared after finish', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-onboarding-draft-'));
  const path = join(directory, 'preferences.db');
  const sqlite = new DatabaseSync(path);
  const draft = {
    version: 1, pattern: 'custom', anchorLocalDate: '2026-12-20', startTemplateIndex: 0,
    startEntryIndex: 1, cycleId: 'stable-cycle-id', templates: [], customEntries: [{ kind: 'OFF' }],
  };
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    await saveOnboardingScheduleDraft(database, draft);
    await saveOnboardingState(database, { step: 4, completed: false });
    sqlite.close();
    const reopened = new DatabaseSync(path);
    const reopenedDatabase = adapter(reopened);
    assert.deepEqual(await getOnboardingState(reopenedDatabase), { step: 4, completed: false });
    assert.deepEqual(await getOnboardingScheduleDraft(reopenedDatabase), draft);
    await saveOnboardingState(reopenedDatabase, { step: 6, completed: true });
    await clearOnboardingScheduleDraft(reopenedDatabase);
    assert.equal(await getOnboardingScheduleDraft(reopenedDatabase), null);
    reopened.close();
  } finally {
    try { sqlite.close(); } catch { /* Database already closed after cold reopen verification. */ }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('showing the 30-day onboarding preview does not write shift cycles or templates', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    const draft = {
      version: 1, pattern: 'fixed', anchorLocalDate: '2026-11-09', startTemplateIndex: 0,
      startEntryIndex: 0, cycleId: 'preview-only-cycle',
      templates: [{ id: 'preview-only-template', code: 'PREVIEW', name: 'Sabit vardiya', startLocalTime: '08:00', endLocalTime: '16:00' }],
      customEntries: [], baseline: null, baselinePatternUnknown: false,
    };
    const count = (table) => sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get().count;
    assert.equal(count('shift_cycles'), 0);
    assert.equal(count('shift_templates'), 0);
    assert.equal(previewNext30Days(draft, '2026-11-09').length, 30);
    assert.equal(count('shift_cycles'), 0);
    assert.equal(count('shift_templates'), 0);
  } finally { sqlite.close(); }
});

test('setup_completed flag drives onboarding completion after setup wizard', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const database = adapter(sqlite);
    await initializeDatabase(database);
    assert.deepEqual(await getOnboardingState(database), { step: 0, completed: false });
    sqlite.exec('UPDATE settings SET setup_completed = 1 WHERE id = 1;');
    assert.deepEqual(await getOnboardingState(database), { step: 0, completed: true });
  } finally { sqlite.close(); }
});
