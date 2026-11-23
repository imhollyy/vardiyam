import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { resetAllData } from '../../src/data/resetRepository.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/data/migrations.ts';

function adapter(sqlite) {
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

async function setupDatabase(sqlite) {
  const db = adapter(sqlite);
  const result = await initializeDatabase(db);
  assert.equal(result.needsReset, false);
  return db;
}

function countRows(sqlite, table) {
  return sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}";`).get().count;
}

test('resetAllData: tam sıfırlama tüm kullanıcı verisini siler', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = await setupDatabase(sqlite);

    // Insert some user data
    sqlite.exec(`
      INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time) VALUES ('t1', 'G', 'Gündüz', '08:00', '16:00');
      INSERT INTO day_entries (local_date, overtime_minutes, late_early_minutes, leave_half_day, leave_hours) VALUES ('2024-01-15', 30, 0, 0, 0);
      INSERT INTO extra_incomes (id, type, amount_minor, frequency, created_at) VALUES ('e1', 'BONUS', 100000, 'MONTHLY', '2024-01-01T00:00:00.000Z');
      UPDATE settings SET salary_minor = 500000 WHERE id = 1;
    `);

    assert.equal(countRows(sqlite, 'shift_templates'), 1);
    assert.equal(countRows(sqlite, 'day_entries'), 1);
    assert.equal(countRows(sqlite, 'extra_incomes'), 1);
    assert.equal(sqlite.prepare('SELECT salary_minor FROM settings WHERE id = 1;').get().salary_minor, 500000);

    await resetAllData(db);

    assert.equal(countRows(sqlite, 'shift_templates'), 0);
    assert.equal(countRows(sqlite, 'day_entries'), 0);
    assert.equal(countRows(sqlite, 'extra_incomes'), 0);
    assert.equal(countRows(sqlite, 'settings'), 1);
    assert.equal(sqlite.prepare('SELECT salary_minor FROM settings WHERE id = 1;').get().salary_minor, 0);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
  } finally { sqlite.close(); }
});

test('resetAllData: sıfırlamadan sonra yeni kurulum yapılabilir', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = await setupDatabase(sqlite);
    sqlite.exec(`UPDATE settings SET setup_completed = 1, salary_minor = 999999 WHERE id = 1;`);

    await resetAllData(db);

    assert.equal(sqlite.prepare('SELECT setup_completed FROM settings WHERE id = 1;').get().setup_completed, 0);
    assert.equal(sqlite.prepare('SELECT salary_minor FROM settings WHERE id = 1;').get().salary_minor, 0);

    // Should be able to initialize again (idempotent — same schema)
    const result2 = await initializeDatabase(db);
    assert.equal(result2.needsReset, false);
    assert.equal(countRows(sqlite, 'settings'), 1);
  } finally { sqlite.close(); }
});

test('resetAllData: hata durumunda transaction geri alınır', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = await setupDatabase(sqlite);
    sqlite.exec(`
      INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time) VALUES ('t1', 'G', 'Gündüz', '08:00', '16:00');
      UPDATE settings SET salary_minor = 777777 WHERE id = 1;
    `);

    // Corrupt the adapter: fail on the 4th execAsync call (inside the transaction,
    // before DELETE FROM shift_templates — callCount 1=PRAGMA, 2=DELETE cycle_entries,
    // 3=DELETE day_entries, 4=DELETE extra_incomes → fail at callCount > 3).
    let callCount = 0;
    const faultyDb = {
      ...db,
      async execAsync(sql) {
        callCount++;
        if (callCount > 3) throw new Error('simulated failure');
        return db.execAsync(sql);
      },
    };

    await assert.rejects(() => resetAllData(faultyDb), /simulated failure/);

    // Data should be preserved after rollback
    assert.equal(countRows(sqlite, 'shift_templates'), 1);
    assert.equal(sqlite.prepare('SELECT salary_minor FROM settings WHERE id = 1;').get().salary_minor, 777777);
  } finally { sqlite.close(); }
});

test('resetAllData: çift sıfırlama güvenli çalışır', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = await setupDatabase(sqlite);
    sqlite.exec(`INSERT INTO extra_incomes (id, type, amount_minor, frequency, created_at) VALUES ('e1', 'BONUS', 50000, 'ONCE', '2024-01-01T00:00:00.000Z');`);

    await resetAllData(db);
    await resetAllData(db);

    assert.equal(countRows(sqlite, 'extra_incomes'), 0);
    assert.equal(countRows(sqlite, 'settings'), 1);
  } finally { sqlite.close(); }
});
