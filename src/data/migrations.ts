import type { SQLiteDatabase } from 'expo-sqlite';

import { withDatabaseOperation } from './transactions.ts';

type MigrationDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'withTransactionAsync'
>;

type Migration = {
  version: number;
  sql: string;
};

export const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE shift_templates (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        start_local_time TEXT NOT NULL
          CHECK (
            length(start_local_time) = 5
            AND start_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
            AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 24
          ),
        end_local_time TEXT NOT NULL
          CHECK (
            length(end_local_time) = 5
            AND end_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
            AND CAST(substr(end_local_time, 1, 2) AS INTEGER) < 24
          ),
        color_token TEXT,
        icon_key TEXT
      );

      CREATE TABLE shift_cycles (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
        anchor_local_date TEXT NOT NULL
          CHECK (
            length(anchor_local_date) = 10
            AND anchor_local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          ),
        start_index INTEGER NOT NULL CHECK (start_index >= 0),
        entry_count INTEGER NOT NULL CHECK (entry_count > 0),
        CHECK (start_index < entry_count)
      );

      CREATE TABLE cycle_entries (
        cycle_id TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('SHIFT', 'OFF')),
        template_id TEXT,
        PRIMARY KEY (cycle_id, position),
        FOREIGN KEY (cycle_id) REFERENCES shift_cycles(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES shift_templates(id) ON DELETE RESTRICT,
        CHECK (
          (kind = 'SHIFT' AND template_id IS NOT NULL)
          OR (kind = 'OFF' AND template_id IS NULL)
        )
      );

      CREATE TRIGGER cycle_entries_position_insert
      BEFORE INSERT ON cycle_entries
      WHEN NEW.position >= (
        SELECT entry_count FROM shift_cycles WHERE id = NEW.cycle_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'cycle entry position exceeds entry_count');
      END;

      CREATE TRIGGER cycle_entries_position_update
      BEFORE UPDATE OF position, cycle_id ON cycle_entries
      WHEN NEW.position >= (
        SELECT entry_count FROM shift_cycles WHERE id = NEW.cycle_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'cycle entry position exceeds entry_count');
      END;

      CREATE TABLE plan_overrides (
        cycle_id TEXT NOT NULL,
        local_date TEXT NOT NULL
          CHECK (
            length(local_date) = 10
            AND local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          ),
        kind TEXT NOT NULL CHECK (kind IN ('SHIFT', 'OFF', 'LEAVE')),
        template_id TEXT,
        reason TEXT,
        PRIMARY KEY (cycle_id, local_date),
        FOREIGN KEY (cycle_id) REFERENCES shift_cycles(id) ON DELETE RESTRICT,
        FOREIGN KEY (template_id) REFERENCES shift_templates(id) ON DELETE RESTRICT,
        CHECK (
          (kind = 'SHIFT' AND template_id IS NOT NULL)
          OR (kind IN ('OFF', 'LEAVE') AND template_id IS NULL)
        )
      );

      CREATE INDEX cycle_entries_template_id_idx ON cycle_entries(template_id);
      CREATE INDEX plan_overrides_template_id_idx ON plan_overrides(template_id);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE work_records (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        record_source TEXT NOT NULL CHECK (record_source IN ('MANUAL', 'PLANNED')),
        started_at_utc TEXT NOT NULL
          CHECK (length(started_at_utc) = 24 AND substr(started_at_utc, -1) = 'Z' AND julianday(started_at_utc) IS NOT NULL),
        ended_at_utc TEXT NOT NULL
          CHECK (length(ended_at_utc) = 24 AND substr(ended_at_utc, -1) = 'Z' AND julianday(ended_at_utc) IS NOT NULL),
        timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
        break_minutes INTEGER NOT NULL CHECK (typeof(break_minutes) = 'integer' AND break_minutes >= 0),
        note TEXT CHECK (note IS NULL OR length(note) <= 2000),
        planned_cycle_id TEXT,
        planned_local_date TEXT,
        planned_template_id TEXT,
        planned_template_name TEXT,
        planned_start_local_datetime TEXT,
        planned_end_local_datetime TEXT,
        CHECK (julianday(ended_at_utc) > julianday(started_at_utc)),
        CHECK (
          (record_source = 'MANUAL'
            AND planned_local_date IS NULL
            AND planned_template_id IS NULL
            AND planned_template_name IS NULL
            AND planned_start_local_datetime IS NULL
            AND planned_end_local_datetime IS NULL)
          OR
          (record_source = 'PLANNED'
            AND planned_local_date IS NOT NULL
            AND planned_template_name IS NOT NULL
            AND planned_start_local_datetime IS NOT NULL
            AND planned_end_local_datetime IS NOT NULL
            AND length(planned_start_local_datetime) = 16
            AND length(planned_end_local_datetime) = 16
            AND substr(planned_start_local_datetime, 11, 1) = 'T'
            AND substr(planned_end_local_datetime, 11, 1) = 'T')
        ),
        CHECK (
          (planned_start_local_datetime IS NULL AND planned_end_local_datetime IS NULL)
          OR
          (planned_start_local_datetime IS NOT NULL AND planned_end_local_datetime IS NOT NULL
            AND length(planned_start_local_datetime) = 16
            AND length(planned_end_local_datetime) = 16)
        ),
        CHECK (
          planned_start_local_datetime IS NULL OR
          (substr(planned_start_local_datetime, 11, 1) = 'T'
            AND substr(planned_start_local_datetime, 12, 2) GLOB '[0-2][0-9]'
            AND CAST(substr(planned_start_local_datetime, 12, 2) AS INTEGER) < 24
            AND substr(planned_start_local_datetime, 14, 1) = ':'
            AND substr(planned_start_local_datetime, 15, 2) GLOB '[0-5][0-9]')
        ),
        CHECK (
          planned_end_local_datetime IS NULL OR
          (substr(planned_end_local_datetime, 11, 1) = 'T'
            AND substr(planned_end_local_datetime, 12, 2) GLOB '[0-2][0-9]'
            AND CAST(substr(planned_end_local_datetime, 12, 2) AS INTEGER) < 24
            AND substr(planned_end_local_datetime, 14, 1) = ':'
            AND substr(planned_end_local_datetime, 15, 2) GLOB '[0-5][0-9]')
        ),
        CHECK (
          planned_local_date IS NULL OR
          (length(planned_local_date) = 10
            AND planned_local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
        ),
        FOREIGN KEY (planned_cycle_id) REFERENCES shift_cycles(id) ON DELETE SET NULL,
        FOREIGN KEY (planned_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL
      );

      CREATE INDEX work_records_started_at_utc_idx ON work_records(started_at_utc DESC, id);
      CREATE INDEX work_records_planned_day_idx ON work_records(planned_cycle_id, planned_local_date);
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export async function runMigrations(database: MigrationDatabase): Promise<void> {
  await withDatabaseOperation(database, async () => {
    const initialVersion = await getSchemaVersion(database);
    assertSupportedVersion(initialVersion);

    if (initialVersion === CURRENT_SCHEMA_VERSION) {
      return;
    }

    await database.withTransactionAsync(async () => {
      const currentVersion = await getSchemaVersion(database);
      assertSupportedVersion(currentVersion);

      for (const migration of migrations) {
        if (migration.version <= currentVersion) {
          continue;
        }

        await database.execAsync(migration.sql);
        await database.execAsync('PRAGMA user_version = ' + migration.version + ';');
      }
    });
  });
}

async function getSchemaVersion(database: MigrationDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');

  if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
    throw new Error('Could not read a valid SQLite schema version.');
  }

  return row.user_version;
}

function assertSupportedVersion(version: number): void {
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      'Database schema version ' +
        version +
        ' is newer than supported version ' +
        CURRENT_SCHEMA_VERSION +
        '.',
    );
  }
}
