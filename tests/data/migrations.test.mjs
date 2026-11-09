import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CURRENT_SCHEMA_VERSION, migrations } from '../../src/data/migrations.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { getThemePreference, saveThemePreference } from '../../src/data/appPreferencesRepository.ts';

function createExpoSqliteAdapter(database) {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async getFirstAsync(sql) {
      return database.prepare(sql).get() ?? null;
    },
    async getAllAsync(sql, ...params) {
      return database.prepare(sql).all(...params);
    },
    async runAsync(sql, ...params) {
      return database.prepare(sql).run(...params);
    },
    async withTransactionAsync(callback) {
      database.exec('BEGIN;');
      try {
        await callback();
        database.exec('COMMIT;');
      } catch (error) {
        database.exec('ROLLBACK;');
        throw error;
      }
    },
  };
}

test('initial migration creates only additive app metadata and sets schema version', async () => {
  const sqlite = new DatabaseSync(':memory:');

  try {
    await initializeDatabase(createExpoSqliteAdapter(sqlite));

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.equal(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_metadata';").get()
        .name,
      'app_metadata',
    );
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM app_metadata;').get().count, 0);
    assert.equal(sqlite.prepare('PRAGMA foreign_keys;').get().foreign_keys, 1);
    for (const table of ['shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots', 'payroll_periods', 'payslip_net_versions', 'net_payments', 'payment_allocations', 'payment_ledger_events', 'active_work_sessions', 'work_day_statuses', 'plan_time_overrides']) {
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?;").get(table).count,
        1,
      );
    }
  } finally {
    sqlite.close();
  }
});

test('v7-to-v9 migrations preserve app and shift data and carry day annotations into the notes table', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const migration of migrations.slice(0, 7)) {
      sqlite.exec(migration.sql);
      sqlite.exec(`PRAGMA user_version = ${migration.version};`);
    }
    sqlite.exec("INSERT INTO app_metadata(key,value) VALUES ('theme_mode','dark');");
    sqlite.exec("INSERT INTO work_day_statuses(local_date,status,note,updated_at_utc) VALUES ('2026-11-05','LEAVE','preserved synthetic note','2026-11-05T05:00:00.000Z');");
    sqlite.prepare('INSERT INTO shift_templates(id,code,name,start_local_time,end_local_time) VALUES(?,?,?,?,?);')
      .run('preserved-template', 'P', 'Synthetic', '08:00', '16:00');
    await initializeDatabase(createExpoSqliteAdapter(sqlite));

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.deepEqual({ ...sqlite.prepare("SELECT key,value FROM app_metadata WHERE key='theme_mode';").get() }, { key: 'theme_mode', value: 'dark' });
    assert.deepEqual({ ...sqlite.prepare("SELECT id,code,name FROM shift_templates WHERE id='preserved-template';").get() }, {
      id: 'preserved-template', code: 'P', name: 'Synthetic',
    });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='active_work_sessions';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='work_day_statuses';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='plan_time_overrides';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='day_edit_notes';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT note FROM day_edit_notes WHERE local_date='2026-11-05';").get().note, 'preserved synthetic note');
  } finally { sqlite.close(); }
});

test('v7-to-v8 adds day-specific plan times without changing existing overrides', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 7)) sqlite.exec(migration.sql);
    sqlite.exec(`INSERT INTO shift_templates(id,code,name,start_local_time,end_local_time) VALUES ('legacy-shift','L','Legacy','08:00','16:00');
      INSERT INTO shift_cycles(id,name,timezone,anchor_local_date,start_index,entry_count) VALUES ('legacy-cycle','Cycle','Europe/Istanbul','2026-11-05',0,1);
      INSERT INTO cycle_entries(cycle_id,position,kind,template_id) VALUES ('legacy-cycle',0,'SHIFT','legacy-shift');
      INSERT INTO plan_overrides(cycle_id,local_date,kind,template_id) VALUES ('legacy-cycle','2026-11-06','SHIFT','legacy-shift');
      PRAGMA user_version = 7;`);
    for (const migration of migrations.filter(({ version }) => version === 8)) {
      sqlite.exec(migration.sql);
      sqlite.exec(`PRAGMA user_version = ${migration.version};`);
    }
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 8);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='day_edit_notes';").get().count, 0);
    assert.equal(sqlite.prepare("SELECT kind FROM plan_overrides WHERE local_date='2026-11-06';").get().kind, 'SHIFT');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM plan_time_overrides;').get().count, 0);
    assert.throws(() => sqlite.prepare("INSERT INTO plan_time_overrides VALUES ('legacy-cycle','2026-11-06','24:00','16:00');").run(), /CHECK constraint failed/);
  } finally { sqlite.close(); }
});

test('v8 database upgrades to v9 and preserves existing status notes', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const migration of migrations.filter(({ version }) => version <= 8)) sqlite.exec(migration.sql);
    sqlite.exec(`PRAGMA user_version = 8;
      INSERT INTO work_day_statuses(local_date,status,note,updated_at_utc)
      VALUES ('2026-11-08','SICK_REPORT','v8 synthetic note','2026-11-05T05:00:00.000Z');`);
    await initializeDatabase(createExpoSqliteAdapter(sqlite));
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    assert.equal(sqlite.prepare("SELECT note FROM day_edit_notes WHERE local_date='2026-11-08';").get().note, 'v8 synthetic note');
    assert.equal(sqlite.prepare("SELECT note FROM work_day_statuses WHERE local_date='2026-11-08';").get().note, 'v8 synthetic note');
  } finally { sqlite.close(); }
});

test('theme preference defaults to light and persists locally across repository reads', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const database = createExpoSqliteAdapter(sqlite);
    await initializeDatabase(database);
    assert.equal(await getThemePreference(database), 'light');
    await saveThemePreference(database, 'dark');
    assert.equal(await getThemePreference(database), 'dark');
    await saveThemePreference(database, 'light');
    assert.equal(await getThemePreference(database), 'light');
  } finally { sqlite.close(); }
});

test('migration is idempotent and preserves unrelated existing data', async () => {
  const sqlite = new DatabaseSync(':memory:');

  try {
    sqlite.exec('CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    sqlite.exec("INSERT INTO app_metadata (key, value) VALUES ('keep', 'preserved');");
    sqlite.exec('PRAGMA user_version = 1;');
    sqlite.exec('CREATE TABLE preserved_record (id INTEGER PRIMARY KEY, note TEXT NOT NULL);');
    sqlite.exec("INSERT INTO preserved_record (note) VALUES ('keep');");
    const adapter = createExpoSqliteAdapter(sqlite);

    await initializeDatabase(adapter);
    await initializeDatabase(adapter);

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, note FROM preserved_record;').get() }, {
      id: 1,
      note: 'keep',
    });
    assert.deepEqual({ ...sqlite.prepare('SELECT key, value FROM app_metadata;').get() }, {
      key: 'keep',
      value: 'preserved',
    });
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM shift_templates;').get().count, 0);
  } finally {
    sqlite.close();
  }
});

test('migration refuses a database schema newer than this app supports', async () => {
  const sqlite = new DatabaseSync(':memory:');

  try {
    sqlite.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1};`);
    await assert.rejects(
      initializeDatabase(createExpoSqliteAdapter(sqlite)),
      /newer than supported version/,
    );
    assert.equal(
      sqlite.prepare('PRAGMA user_version;').get().user_version,
      CURRENT_SCHEMA_VERSION + 1,
    );
  } finally {
    sqlite.close();
  }
});

test('failed v2 migration rolls back partial DDL and preserves v1 rows', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    sqlite.exec("INSERT INTO app_metadata (key, value) VALUES ('legacy', 'unchanged');");
    sqlite.exec('PRAGMA user_version = 1;');
    sqlite.exec('CREATE TABLE shift_cycles (sentinel TEXT);');

    await assert.rejects(initializeDatabase(createExpoSqliteAdapter(sqlite)));
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 1);
    assert.deepEqual({ ...sqlite.prepare('SELECT key, value FROM app_metadata;').get() }, {
      key: 'legacy',
      value: 'unchanged',
    });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='shift_templates';").get().count,
      0,
    );
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM shift_cycles;').get().count, 0);
  } finally {
    sqlite.close();
  }
});

test('v5 to v7 preserves existing work and approved gross snapshots', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const database = createExpoSqliteAdapter(sqlite);
  try {
    for (const migration of migrations.slice(0, 5)) {
      sqlite.exec(migration.sql);
      sqlite.exec(`PRAGMA user_version = ${migration.version};`);
    }
    sqlite.exec(`INSERT INTO earnings_profiles VALUES ('default',1,'2026-01-01T00:00:00.000Z','{}');
      INSERT INTO earnings_rule_versions VALUES ('rules-v1','default',1,1,'2026-01-01T00:00:00.000Z','{}');
      INSERT INTO earnings_snapshots VALUES ('gross-v1','2026-01-02T00:00:00.000Z','default',1,'rules-v1','COMPLETE',123,'{}','{}');
      INSERT INTO app_metadata VALUES ('legacy','kept');`);
    await initializeDatabase(database);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    assert.equal(sqlite.prepare("SELECT total_amount_minor FROM earnings_snapshots WHERE calculation_id='gross-v1';").get().total_amount_minor, 123);
    assert.equal(sqlite.prepare("SELECT value FROM app_metadata WHERE key='legacy';").get().value, 'kept');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='payment_allocations';").get().count, 1);
    await initializeDatabase(database);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
  } finally { sqlite.close(); }
});

test('v2 to v4 adds work records and timed-break storage while preserving shift configuration and overrides', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 2)) sqlite.exec(migration.sql);
    sqlite.exec('PRAGMA user_version = 2;');
    sqlite.exec(`
      INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time)
      VALUES ('day', 'D', 'Day', '08:00', '16:00');
      INSERT INTO shift_cycles (id, name, timezone, anchor_local_date, start_index, entry_count)
      VALUES ('cycle', 'Synthetic', 'Europe/Istanbul', '2026-01-01', 0, 1);
      INSERT INTO cycle_entries (cycle_id, position, kind, template_id) VALUES ('cycle', 0, 'SHIFT', 'day');
      INSERT INTO plan_overrides (cycle_id, local_date, kind, template_id) VALUES ('cycle', '2026-01-02', 'OFF', NULL);
      INSERT INTO app_metadata (key, value) VALUES ('keep', 'v2-data');
      PRAGMA user_version = 2;
    `);

    await initializeDatabase(createExpoSqliteAdapter(sqlite));
    await initializeDatabase(createExpoSqliteAdapter(sqlite));

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, name FROM shift_cycles;').get() }, { id: 'cycle', name: 'Synthetic' });
    assert.deepEqual({ ...sqlite.prepare('SELECT * FROM cycle_entries;').get() }, {
      cycle_id: 'cycle', position: 0, kind: 'SHIFT', template_id: 'day',
    });
    assert.equal(sqlite.prepare('SELECT kind FROM plan_overrides WHERE cycle_id = ?;').get('cycle').kind, 'OFF');
    assert.equal(sqlite.prepare('SELECT value FROM app_metadata WHERE key = ?;').get('keep').value, 'v2-data');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM work_records;').get().count, 0);
  } finally { sqlite.close(); }
});

test('v3 to v4 leaves historical aggregate-only work records unchanged', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 3)) sqlite.exec(migration.sql);
    sqlite.exec(`
      INSERT INTO work_records (
        id, record_source, started_at_utc, ended_at_utc, timezone, break_minutes, note
      ) VALUES (
        'legacy-work', 'MANUAL', '2026-10-28T07:00:00.000Z', '2026-10-28T15:00:00.000Z',
        'Europe/Istanbul', 30, 'synthetic legacy record'
      );
      PRAGMA user_version = 3;
    `);
    const adapter = createExpoSqliteAdapter(sqlite);

    await initializeDatabase(adapter);
    await initializeDatabase(adapter);

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, started_at_utc, ended_at_utc, break_minutes, note FROM work_records WHERE id = ?;').get('legacy-work') }, {
      id: 'legacy-work', started_at_utc: '2026-10-28T07:00:00.000Z', ended_at_utc: '2026-10-28T15:00:00.000Z',
      break_minutes: 30, note: 'synthetic legacy record',
    });
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM break_intervals WHERE work_record_id = ?;').get('legacy-work').count, 0);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_list(break_intervals);').get().on_delete, 'CASCADE');
  } finally { sqlite.close(); }
});

test('v4 to v5 preserves actual work and timed breaks and adds append-only earnings tables', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 4)) sqlite.exec(migration.sql);
    sqlite.exec(`
      INSERT INTO work_records(id, record_source, started_at_utc, ended_at_utc, timezone, break_minutes, note)
      VALUES ('synthetic-v4-work', 'MANUAL', '2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z', 'Europe/Istanbul', 30, 'synthetic');
      INSERT INTO break_intervals(id, work_record_id, started_at_utc, ended_at_utc)
      VALUES ('synthetic-break', 'synthetic-v4-work', '2026-01-05T09:00:00.000Z', '2026-01-05T09:30:00.000Z');
      PRAGMA user_version = 4;
    `);
    await initializeDatabase(createExpoSqliteAdapter(sqlite));
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    assert.equal(sqlite.prepare('SELECT note FROM work_records WHERE id=?').get('synthetic-v4-work').note, 'synthetic');
    assert.deepEqual({ ...sqlite.prepare('SELECT id, work_record_id, started_at_utc, ended_at_utc FROM break_intervals').get() }, {
      id: 'synthetic-break', work_record_id: 'synthetic-v4-work', started_at_utc: '2026-01-05T09:00:00.000Z', ended_at_utc: '2026-01-05T09:30:00.000Z',
    });
    for (const table of ['earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots']) {
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
    }
  } finally { sqlite.close(); }
});

test('failed v5 DDL rolls back partially-created earnings tables and preserves v4 version and data', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 4)) sqlite.exec(migration.sql);
    sqlite.exec("INSERT INTO app_metadata(key, value) VALUES ('keep', 'v4'); PRAGMA user_version = 4; CREATE TABLE earnings_rule_versions(conflict TEXT);");
    await assert.rejects(initializeDatabase(createExpoSqliteAdapter(sqlite)), /already exists/);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 4);
    assert.equal(sqlite.prepare("SELECT value FROM app_metadata WHERE key='keep'").get().value, 'v4');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='earnings_profiles'").get().n, 0);
  } finally { sqlite.close(); }
});

test('failed v4 DDL rolls back and preserves v3 work-record rows and version', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 3)) sqlite.exec(migration.sql);
    sqlite.exec(`
      INSERT INTO work_records (
        id, record_source, started_at_utc, ended_at_utc, timezone, break_minutes
      ) VALUES ('legacy-work', 'MANUAL', '2026-01-01T05:00:00.000Z', '2026-01-01T13:00:00.000Z', 'Europe/Istanbul', 30);
      CREATE TABLE break_intervals (sentinel TEXT);
      PRAGMA user_version = 3;
    `);
    await assert.rejects(initializeDatabase(createExpoSqliteAdapter(sqlite)));
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 3);
    assert.equal(sqlite.prepare('SELECT break_minutes FROM work_records WHERE id = ?;').get('legacy-work').break_minutes, 30);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('break_intervals') WHERE name = 'sentinel';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name='break_intervals_validate_insert';").get().count, 0);
  } finally { sqlite.close(); }
});

test('failed v3 DDL leaves a v2 database and its rows intact', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.filter(({ version }) => version <= 2)) sqlite.exec(migration.sql);
    sqlite.exec("INSERT INTO app_metadata (key, value) VALUES ('rollback', 'preserved'); CREATE TABLE work_records (sentinel TEXT); PRAGMA user_version = 2;");
    await assert.rejects(initializeDatabase(createExpoSqliteAdapter(sqlite)));
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 2);
    assert.equal(sqlite.prepare('SELECT value FROM app_metadata WHERE key = ?;').get('rollback').value, 'preserved');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('work_records') WHERE name = 'sentinel';").get().count, 1);
  } finally { sqlite.close(); }
});
