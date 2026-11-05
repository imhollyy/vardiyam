import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CURRENT_SCHEMA_VERSION, migrations } from '../../src/data/migrations.ts';
import { initializeDatabase } from '../../src/data/database.ts';

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
    for (const table of ['shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals']) {
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?;").get(table).count,
        1,
      );
    }
  } finally {
    sqlite.close();
  }
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

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 4);
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

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 4);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, started_at_utc, ended_at_utc, break_minutes, note FROM work_records WHERE id = ?;').get('legacy-work') }, {
      id: 'legacy-work', started_at_utc: '2026-10-28T07:00:00.000Z', ended_at_utc: '2026-10-28T15:00:00.000Z',
      break_minutes: 30, note: 'synthetic legacy record',
    });
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM break_intervals WHERE work_record_id = ?;').get('legacy-work').count, 0);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_list(break_intervals);').get().on_delete, 'CASCADE');
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
