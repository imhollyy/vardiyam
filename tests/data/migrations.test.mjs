import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { runMigrations, CURRENT_SCHEMA_VERSION } from '../../src/data/migrations.ts';

function createExpoSqliteAdapter(database) {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async getFirstAsync(sql) {
      return database.prepare(sql).get() ?? null;
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
    await runMigrations(createExpoSqliteAdapter(sqlite));

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.equal(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_metadata';").get()
        .name,
      'app_metadata',
    );
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM app_metadata;').get().count, 0);
  } finally {
    sqlite.close();
  }
});

test('migration is idempotent and preserves unrelated existing data', async () => {
  const sqlite = new DatabaseSync(':memory:');

  try {
    sqlite.exec('CREATE TABLE preserved_record (id INTEGER PRIMARY KEY, note TEXT NOT NULL);');
    sqlite.exec("INSERT INTO preserved_record (note) VALUES ('keep');");
    const adapter = createExpoSqliteAdapter(sqlite);

    await runMigrations(adapter);
    await runMigrations(adapter);

    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, CURRENT_SCHEMA_VERSION);
    assert.deepEqual({ ...sqlite.prepare('SELECT id, note FROM preserved_record;').get() }, {
      id: 1,
      note: 'keep',
    });
  } finally {
    sqlite.close();
  }
});

test('migration refuses a database schema newer than this app supports', async () => {
  const sqlite = new DatabaseSync(':memory:');

  try {
    sqlite.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1};`);
    await assert.rejects(
      runMigrations(createExpoSqliteAdapter(sqlite)),
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
