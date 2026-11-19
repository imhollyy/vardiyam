import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CURRENT_SCHEMA_VERSION, FIRST_SCHEMA_VERSION } from '../../src/data/migrations.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { getOnboardingState, getThemePreference, saveThemePreference } from '../../src/data/appPreferencesRepository.ts';

function adapter(database) {
  return {
    async execAsync(sql) { database.exec(sql); },
    async getFirstAsync(sql, ...params) { return database.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return database.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return database.prepare(sql).run(...params); },
    async withTransactionAsync(callback) {
      database.exec('BEGIN;');
      try { await callback(); database.exec('COMMIT;'); } catch (error) { database.exec('ROLLBACK;'); throw error; }
    },
  };
}

const tableCount = (sqlite, name) =>
  sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?;").get(name).count;

test('yeni kurulum: temiz şema oluşur ve sürüm ayarlanır', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const result = await initializeDatabase(adapter(sqlite));
    assert.equal(result.needsReset, false);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.ok(CURRENT_SCHEMA_VERSION >= FIRST_SCHEMA_VERSION);
    for (const table of ['app_metadata', 'settings', 'shift_templates', 'shift_cycles', 'cycle_entries', 'day_entries', 'extra_incomes']) {
      assert.equal(tableCount(sqlite, table), 1, table);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM settings;').get().count, 1);
  } finally { sqlite.close(); }
});

test('ikinci açılış: aynı sürümde sıfırlama istenmez, veri korunur', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    await initializeDatabase(adapter(sqlite));
    sqlite.exec('UPDATE settings SET salary_minor = 123400 WHERE id = 1;');
    const result = await initializeDatabase(adapter(sqlite));
    assert.equal(result.needsReset, false);
    assert.equal(sqlite.prepare('SELECT salary_minor FROM settings WHERE id = 1;').get().salary_minor, 123400);
  } finally { sqlite.close(); }
});

test('eski Vardiyam veritabanı (sürüm 1–9) hata vermek yerine sıfırlama ister', async () => {
  for (const legacyVersion of [1, 7, 9]) {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('CREATE TABLE work_records (id TEXT PRIMARY KEY); PRAGMA user_version = ' + legacyVersion + ';');
      const result = await initializeDatabase(adapter(sqlite));
      assert.equal(result.needsReset, true, 'sürüm ' + legacyVersion);
    } finally { sqlite.close(); }
  }
});

test('desteklenenden yeni bir sürüm hâlâ reddedilir', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA user_version = ' + (CURRENT_SCHEMA_VERSION + 1) + ';');
    await assert.rejects(() => initializeDatabase(adapter(sqlite)));
  } finally { sqlite.close(); }
});

test('kurulum durumu settings tablosundan okunur (silinmiş tablolara bakılmaz)', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = adapter(sqlite);
    await initializeDatabase(db);
    assert.equal((await getOnboardingState(db)).completed, false);
    sqlite.exec('UPDATE settings SET setup_completed = 1 WHERE id = 1;');
    assert.equal((await getOnboardingState(db)).completed, true);
  } finally { sqlite.close(); }
});

test('tema tercihi kaydedilir ve okunur', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = adapter(sqlite);
    await initializeDatabase(db);
    assert.equal(await getThemePreference(db), 'light');
    await saveThemePreference(db, 'dark');
    assert.equal(await getThemePreference(db), 'dark');
  } finally { sqlite.close(); }
});
