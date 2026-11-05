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

function createHistoricalDatabase(version) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations.slice(0, version)) {
    sqlite.exec(migration.sql);
    sqlite.exec(`PRAGMA user_version = ${migration.version};`);
  }
  sqlite.exec("INSERT INTO app_metadata (key, value) VALUES ('synthetic_marker', 'keep-me');");
  return sqlite;
}

async function createReferenceDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  return { database: expoAdapter(sqlite), close: async () => sqlite.close() };
}

test('synthetic v1-v6 database images validate, migrate in staging, and preserve prior metadata', async (t) => {
  for (let sourceVersion = 1; sourceVersion <= 6; sourceVersion += 1) {
    await t.test(`v${sourceVersion} to v${CURRENT_SCHEMA_VERSION}`, async () => {
      const source = createHistoricalDatabase(sourceVersion);
      const image = source.serialize();
      source.close();
      const restored = new DatabaseSync(':memory:');
      try {
        restored.deserialize(image);
        const result = await validateBackupDatabase(expoAdapter(restored), {
          createReferenceDatabase,
          expectedSchemaVersion: sourceVersion,
          migrateToCurrent: true,
        });
        assert.equal(result.schemaVersion, CURRENT_SCHEMA_VERSION);
        assert.equal(result.migrated, sourceVersion < CURRENT_SCHEMA_VERSION);
        assert.equal(restored.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
        assert.equal(restored.prepare("SELECT value FROM app_metadata WHERE key='synthetic_marker';").get().value, 'keep-me');
        assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='payment_ledger_events';").get().count, 1);
      } finally { restored.close(); }
    });
  }
});

test('backup validation rejects future schemas, missing v6 guards, and foreign key corruption', async (t) => {
  await t.test('future user_version', async () => {
    const sqlite = createHistoricalDatabase(6);
    try {
      sqlite.exec('PRAGMA user_version = 7;');
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /sürümü desteklenmiyor/);
    } finally { sqlite.close(); }
  });

  await t.test('missing immutable ledger trigger', async () => {
    const sqlite = createHistoricalDatabase(6);
    try {
      sqlite.exec('DROP TRIGGER payment_ledger_events_no_delete;');
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /koruma kuralları eksik/);
    } finally { sqlite.close(); }
  });

  await t.test('same-named table with altered columns does not pass canonical schema validation', async () => {
    const sqlite = createHistoricalDatabase(6);
    try {
      sqlite.exec('ALTER TABLE payment_ledger_events ADD COLUMN injected TEXT;');
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /tabloları, ilişkileri veya koruma kuralları/);
    } finally { sqlite.close(); }
  });

  await t.test('foreign key violation', async () => {
    const sqlite = createHistoricalDatabase(6);
    try {
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      sqlite.exec("INSERT INTO payment_allocations (id,payment_id,period_id,amount_minor,created_at_utc,updated_at_utc) VALUES ('synthetic-orphan','missing-payment','missing-period',1,'2026-11-05T12:00:00.000Z','2026-11-05T12:00:00.000Z');");
      await assert.rejects(validateBackupDatabase(expoAdapter(sqlite), { createReferenceDatabase }), /ilişkisiz veya bozuk/);
    } finally { sqlite.close(); }
  });
});

test('full synthetic v6 database image preserves plans, work, breaks, approved earnings, and payment ledger', async () => {
  const source = new DatabaseSync(':memory:');
  const sourceAdapter = expoAdapter(source);
  const stamp = '2026-11-05T12:00:00.000Z';
  try {
    await initializeDatabase(sourceAdapter);
    source.exec(`
      INSERT INTO shift_templates(id,code,name,start_local_time,end_local_time) VALUES ('syn-shift','D','Synthetic day','08:00','16:00');
      INSERT INTO shift_cycles(id,name,timezone,anchor_local_date,start_index,entry_count) VALUES ('syn-cycle','Synthetic','Europe/Istanbul','2026-11-05',0,1);
      INSERT INTO cycle_entries(cycle_id,position,kind,template_id) VALUES ('syn-cycle',0,'SHIFT','syn-shift');
      INSERT INTO plan_overrides(cycle_id,local_date,kind,template_id,reason) VALUES ('syn-cycle','2026-11-06','LEAVE',NULL,'synthetic');
      INSERT INTO work_records(id,record_source,started_at_utc,ended_at_utc,timezone,break_minutes,note)
        VALUES ('syn-work','MANUAL','2026-11-05T08:00:00.000Z','2026-11-05T16:00:00.000Z','Europe/Istanbul',30,'synthetic');
      INSERT INTO break_intervals(id,work_record_id,started_at_utc,ended_at_utc)
        VALUES ('syn-break','syn-work','2026-11-05T10:00:00.000Z','2026-11-05T10:30:00.000Z');
      INSERT INTO earnings_profiles(id,version,created_at_utc,profile_json) VALUES ('syn-profile',1,'${stamp}','{"mode":"SKIP"}');
      INSERT INTO earnings_rule_versions(id,profile_id,profile_version,version,created_at_utc,rules_json)
        VALUES ('syn-rules','syn-profile',1,1,'${stamp}','[]');
      INSERT INTO earnings_snapshots(calculation_id,created_at_utc,profile_id,profile_version,rule_version_id,status,total_amount_minor,input_json,snapshot_json)
        VALUES ('syn-snapshot','${stamp}','syn-profile',1,'syn-rules','COMPLETE',12345,'{}','{"synthetic":"immutable"}');
      INSERT INTO payroll_periods(id,start_local_date,end_exclusive_local_date,timezone,configured_start_day,created_at_utc)
        VALUES ('syn-period','2026-11-01','2026-12-01','Europe/Istanbul',1,'${stamp}');
      INSERT INTO payslip_net_versions(period_id,version,amount_minor,note,created_at_utc)
        VALUES ('syn-period',1,3500000,'synthetic','${stamp}');
      INSERT INTO net_payments(id,payment_local_date,amount_minor,method,description,created_at_utc,updated_at_utc)
        VALUES ('syn-payment','2026-11-10',3000000,'BANK','synthetic','${stamp}','${stamp}');
      INSERT INTO payment_allocations(id,payment_id,period_id,amount_minor,created_at_utc,updated_at_utc)
        VALUES ('syn-allocation','syn-payment','syn-period',3000000,'${stamp}','${stamp}');
      INSERT INTO payment_ledger_events(id,entity_type,entity_id,event_type,event_at_utc,data_json)
        VALUES ('syn-ledger','PAYMENT','syn-payment','CREATE','${stamp}','{"synthetic":true}');
    `);

    const serialized = source.serialize();
    const restored = new DatabaseSync(':memory:');
    try {
      restored.deserialize(serialized);
      const result = await validateBackupDatabase(expoAdapter(restored), { createReferenceDatabase, expectedSchemaVersion: 6 });
      assert.equal(result.recordCount, 14);
      assert.equal(restored.prepare('SELECT note FROM work_records WHERE id=?').get('syn-work').note, 'synthetic');
      assert.equal(restored.prepare('SELECT started_at_utc FROM break_intervals WHERE id=?').get('syn-break').started_at_utc, '2026-11-05T10:00:00.000Z');
      assert.equal(restored.prepare('SELECT snapshot_json FROM earnings_snapshots WHERE calculation_id=?').get('syn-snapshot').snapshot_json, '{"synthetic":"immutable"}');
      assert.equal(restored.prepare('SELECT amount_minor FROM payslip_net_versions WHERE period_id=?').get('syn-period').amount_minor, 3500000);
      assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM payment_allocations WHERE payment_id=?').get('syn-payment').count, 1);
      assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM payment_ledger_events').get().count, 1);
    } finally { restored.close(); }
  } finally { source.close(); }
});
