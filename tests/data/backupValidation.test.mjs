/**
 * Backup validation tests — new schema v100.
 * Old schema (v1–v9) tests removed: schema was rewritten from scratch at v100.
 * Caller: src/data/backupValidation.ts (validateBackupDatabase).
 * User instruction: "Phase 4: backup for new schema, test cleanup → 0 test failures"
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { validateBackupDatabase } from '../../src/data/backupValidation.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { CURRENT_SCHEMA_VERSION, migrations } from '../../src/data/migrations.ts';

function expoAdapter(sqlite) {
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

async function createReferenceDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  return { database: expoAdapter(sqlite), close: async () => sqlite.close() };
}

function createV100Database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) {
    sqlite.exec(migration.sql);
    sqlite.exec(`PRAGMA user_version = ${migration.version};`);
  }
  sqlite.exec("INSERT INTO app_metadata (key, value) VALUES ('synthetic_marker', 'keep-me');");
  return sqlite;
}

test(`v${CURRENT_SCHEMA_VERSION} database validates without migration`, async () => {
  const source = createV100Database();
  const image = source.serialize();
  source.close();
  const restored = new DatabaseSync(':memory:');
  try {
    restored.deserialize(image);
    const result = await validateBackupDatabase(expoAdapter(restored), {
      createReferenceDatabase,
      expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
    });
    assert.equal(result.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(result.migrated, false);
    assert.equal(restored.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.equal(restored.prepare("SELECT value FROM app_metadata WHERE key='synthetic_marker';").get().value, 'keep-me');
  } finally { restored.close(); }
});

test('backup validation rejects future schemas, missing triggers, and schema corruption', async (t) => {
  await t.test('future user_version', async () => {
    const sqlite = createV100Database();
    try {
      sqlite.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1};`);
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /sürümü desteklenmiyor/);
    } finally { sqlite.close(); }
  });

  await t.test('missing immutable cycle entries trigger', async () => {
    const sqlite = createV100Database();
    try {
      sqlite.exec('DROP TRIGGER cycle_entries_position_insert;');
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /koruma kuralları eksik/);
    } finally { sqlite.close(); }
  });

  await t.test('same-named table with altered columns does not pass canonical schema validation', async () => {
    const sqlite = createV100Database();
    try {
      sqlite.exec('ALTER TABLE day_entries ADD COLUMN injected TEXT;');
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /tabloları, ilişkileri veya koruma kuralları/);
    } finally { sqlite.close(); }
  });

  await t.test('foreign key violation in cycle_entries', async () => {
    const sqlite = createV100Database();
    try {
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      sqlite.exec("INSERT INTO cycle_entries (cycle_id, position, kind, template_id) VALUES ('missing-cycle', 0, 'OFF', NULL);");
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /ilişkisiz veya bozuk/);
    } finally { sqlite.close(); }
  });
});

test('full v100 database image preserves shift cycles, day entries, extra incomes, and metadata', async () => {
  const source = new DatabaseSync(':memory:');
  const sourceAdapter = expoAdapter(source);
  try {
    await initializeDatabase(sourceAdapter);
    source.exec(`
      INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time)
        VALUES ('syn-tpl', 'D', 'Gündüz', '08:00', '16:00');
      INSERT INTO shift_cycles (id, name, timezone, anchor_local_date, start_index, entry_count, effective_from)
        VALUES ('syn-cycle', 'Vardiyam', 'Europe/Istanbul', '2026-11-05', 0, 1, '2026-11-05');
      INSERT INTO cycle_entries (cycle_id, position, kind, template_id)
        VALUES ('syn-cycle', 0, 'SHIFT', 'syn-tpl');
      INSERT INTO day_entries (local_date, overtime_minutes, leave_type, note)
        VALUES ('2026-11-07', 90, 'ANNUAL', 'synthetic note');
      INSERT INTO extra_incomes (id, type, amount_minor, frequency)
        VALUES ('syn-extra', 'BONUS', 500000, 'MONTHLY');
      INSERT INTO app_metadata (key, value) VALUES ('syn_key', 'syn_value');
    `);

    const serialized = source.serialize();
    const restored = new DatabaseSync(':memory:');
    try {
      restored.deserialize(serialized);
      const result = await validateBackupDatabase(expoAdapter(restored), {
        createReferenceDatabase,
        expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
      });
      assert.ok(result.recordCount >= 5, `recordCount should be >= 5, got ${result.recordCount}`);
      assert.equal(result.schemaVersion, CURRENT_SCHEMA_VERSION);
      assert.equal(restored.prepare('SELECT name FROM shift_templates WHERE id=?').get('syn-tpl').name, 'Gündüz');
      assert.equal(restored.prepare('SELECT overtime_minutes FROM day_entries WHERE local_date=?').get('2026-11-07').overtime_minutes, 90);
      assert.equal(restored.prepare('SELECT note FROM day_entries WHERE local_date=?').get('2026-11-07').note, 'synthetic note');
      assert.equal(restored.prepare('SELECT amount_minor FROM extra_incomes WHERE id=?').get('syn-extra').amount_minor, 500000);
      assert.equal(restored.prepare("SELECT value FROM app_metadata WHERE key='syn_key';").get().value, 'syn_value');
    } finally { restored.close(); }
  } finally { source.close(); }
});
