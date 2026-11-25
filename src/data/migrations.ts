import type { SQLiteDatabase } from 'expo-sqlite';

import { withDatabaseOperation } from './transactions.ts';

type MigrationDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'withTransactionAsync'
>;

type Migration = {
  version: number;
  sql: string;
  requiresFKOff?: boolean;
};

function canonicalLocalDateCheck(column: string): string {
  return `
    length(${column}) = 10
    AND ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND CAST(substr(${column}, 6, 2) AS INTEGER) BETWEEN 1 AND 12
    AND CAST(substr(${column}, 9, 2) AS INTEGER) BETWEEN 1 AND CASE CAST(substr(${column}, 6, 2) AS INTEGER)
      WHEN 2 THEN CASE
        WHEN CAST(substr(${column}, 1, 4) AS INTEGER) % 400 = 0
          OR (CAST(substr(${column}, 1, 4) AS INTEGER) % 4 = 0
            AND CAST(substr(${column}, 1, 4) AS INTEGER) % 100 <> 0) THEN 29
        ELSE 28
      END
      WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30
      ELSE 31
    END
  `;
}

/**
 * Yeni şema 100'den başlar. Eski "Vardiyam" sürümleri 1–9 arasını kullanıyordu;
 * bu aralıkta bir veritabanı bulunursa uyumsuz sayılır ve sıfırlanır.
 * Yeni migration eklerken 101, 102… şeklinde devam et.
 */
export const FIRST_SCHEMA_VERSION = 100;

export const DEFAULT_SETTINGS_INSERT_SQL = 'INSERT OR IGNORE INTO settings (id) VALUES (1);';

export const migrations: readonly Migration[] = [
  {
    version: 100,
    sql: `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        salary_minor INTEGER NOT NULL DEFAULT 0,
        salary_type TEXT NOT NULL DEFAULT 'GROSS' CHECK (salary_type IN ('GROSS', 'NET')),
        payday TEXT NOT NULL DEFAULT '1' CHECK (
          payday = 'LAST' OR (CAST(payday AS INTEGER) BETWEEN 1 AND 31 AND payday = CAST(CAST(payday AS INTEGER) AS TEXT))
        ),
        bes_enabled INTEGER NOT NULL DEFAULT 0 CHECK (bes_enabled IN (0, 1)),
        bes_rate_bp INTEGER NOT NULL DEFAULT 300 CHECK (bes_rate_bp BETWEEN 0 AND 10000),
        work_schedule TEXT NOT NULL DEFAULT 'MON_FRI' CHECK (work_schedule IN ('MON_FRI', 'MON_SAT', 'EVERY_DAY')),
        shift_pattern TEXT NOT NULL DEFAULT 'FIXED_DAY' CHECK (shift_pattern IN ('TWO_SHIFT', 'THREE_SHIFT', 'FIXED_DAY', 'FIXED_NIGHT')),
        start_date TEXT CHECK (start_date IS NULL OR (${canonicalLocalDateCheck('start_date')})),
        setup_completed INTEGER NOT NULL DEFAULT 0 CHECK (setup_completed IN (0, 1))
      );

      CREATE TABLE shift_templates (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        start_local_time TEXT NOT NULL CHECK (
          length(start_local_time) = 5
          AND start_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 24
        ),
        end_local_time TEXT NOT NULL CHECK (
          length(end_local_time) = 5
          AND end_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND CAST(substr(end_local_time, 1, 2) AS INTEGER) < 24
        ),
        standard_minutes INTEGER NOT NULL DEFAULT 480 CHECK (standard_minutes > 0 AND standard_minutes <= 1440),
        color_token TEXT,
        icon_key TEXT
      );

      CREATE TABLE shift_cycles (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
        anchor_local_date TEXT NOT NULL CHECK (
          length(anchor_local_date) = 10
          AND anchor_local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        ),
        start_index INTEGER NOT NULL CHECK (start_index >= 0),
        entry_count INTEGER NOT NULL CHECK (entry_count > 0),
        effective_from TEXT NOT NULL CHECK (${canonicalLocalDateCheck('effective_from')}),
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
      WHEN NEW.position >= (SELECT entry_count FROM shift_cycles WHERE id = NEW.cycle_id)
      BEGIN
        SELECT RAISE(ABORT, 'cycle entry position exceeds cycle entry_count');
      END;

      CREATE TRIGGER cycle_entries_position_update
      BEFORE UPDATE OF position ON cycle_entries
      WHEN NEW.position >= (SELECT entry_count FROM shift_cycles WHERE id = NEW.cycle_id)
      BEGIN
        SELECT RAISE(ABORT, 'cycle entry position exceeds cycle entry_count');
      END;

      CREATE TABLE day_entries (
        local_date TEXT PRIMARY KEY NOT NULL CHECK (${canonicalLocalDateCheck('local_date')}),
        shift_override_id TEXT REFERENCES shift_templates(id),
        overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
        late_early_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_early_minutes >= 0),
        leave_type TEXT CHECK (leave_type IS NULL OR leave_type IN (
          'ANNUAL', 'UNPAID', 'SICK', 'EXCUSE', 'MATERNITY', 'BEREAVEMENT', 'SOCIAL', 'HOURLY', 'HOLIDAY'
        )),
        leave_half_day INTEGER NOT NULL DEFAULT 0 CHECK (leave_half_day IN (0, 1)),
        leave_hours REAL NOT NULL DEFAULT 0 CHECK (leave_hours >= 0 AND leave_hours <= 24),
        deduct_override INTEGER CHECK (deduct_override IS NULL OR deduct_override IN (0, 1)),
        note TEXT CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 2000)
      );

      CREATE TABLE extra_incomes (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        type TEXT NOT NULL CHECK (type IN ('BONUS', 'TRANSPORT', 'FOOD', 'SOCIAL', 'PERFORMANCE', 'OTHER')),
        custom_name TEXT CHECK (custom_name IS NULL OR length(trim(custom_name)) BETWEEN 1 AND 200),
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('MONTHLY', 'ONCE', 'QUARTERLY', 'BIANNUAL', 'ANNUAL')),
        first_payment_date TEXT CHECK (
          first_payment_date IS NULL OR (${canonicalLocalDateCheck('first_payment_date')})
        ),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now'))
      );

      ${DEFAULT_SETTINGS_INSERT_SQL}
    `,
  },
  {
    version: 101,
    sql: `
      ALTER TABLE shift_templates ADD COLUMN break_minutes INTEGER NOT NULL DEFAULT 0;

      -- Fill existing rows with the legal minimum break based on shift duration.
      -- duration <= 240 min → 15 dk, <= 450 → 30 dk, > 450 → 60 dk (İş K. md. 68)
      UPDATE shift_templates SET break_minutes = CASE
        WHEN standard_minutes <= 240 THEN 15
        WHEN standard_minutes <= 450 THEN 30
        ELSE 60
      END;
    `,
  },
  {
    version: 102,
    requiresFKOff: true,
    sql: `
      CREATE TABLE shift_templates_v102 (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        code TEXT NOT NULL CHECK (length(trim(code)) > 0),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        start_local_time TEXT NOT NULL CHECK (
          length(start_local_time) = 5
          AND start_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 24
        ),
        end_local_time TEXT NOT NULL CHECK (
          length(end_local_time) = 5
          AND end_local_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND CAST(substr(end_local_time, 1, 2) AS INTEGER) < 24
        ),
        standard_minutes INTEGER NOT NULL DEFAULT 480 CHECK (standard_minutes > 0 AND standard_minutes <= 1440),
        break_minutes INTEGER NOT NULL DEFAULT 0,
        color_token TEXT,
        icon_key TEXT
      );

      INSERT INTO shift_templates_v102
        SELECT id, code, name, start_local_time, end_local_time, standard_minutes, break_minutes, color_token, icon_key
        FROM shift_templates;

      DROP TABLE shift_templates;

      ALTER TABLE shift_templates_v102 RENAME TO shift_templates;
    `,
  },
  {
    version: 103,
    sql: `
      -- Remove overtime/late-early from leave days (data consistency fix).
      -- HOURLY leave is excluded because those days can legitimately have overtime.
      UPDATE day_entries
      SET overtime_minutes = 0, late_early_minutes = 0
      WHERE leave_type IS NOT NULL AND leave_type <> 'HOURLY';
    `,
  },
  {
    version: 104,
    sql: `
      ALTER TABLE settings ADD COLUMN hourly_leave_policy TEXT NOT NULL DEFAULT 'BASE_PAY' CHECK (hourly_leave_policy IN ('OVERTIME_FIRST','BASE_PAY'));
    `,
  },
  {
    version: 105,
    // If a user has exactly one shift_cycle row and its effective_from is in the future
    // relative to the earliest known day_entries date (or simply > '2000-01-01' anchor
    // heuristic), reset it to the Monday of the cycle's anchor_local_date.
    // This fixes users whose only cycle row had effective_from overwritten by the old
    // updateShiftCycle bug.
    sql: `
      UPDATE shift_cycles
      SET effective_from = anchor_local_date
      WHERE (SELECT COUNT(*) FROM shift_cycles) = 1
        AND effective_from > anchor_local_date;
    `,
  },
  {
    version: 106,
    // Backfill color_token for shift_templates that have NULL or empty value.
    // Heuristic: infer from the shift code (G/S=day, A=evening, GC=night) or start time.
    sql: `
      UPDATE shift_templates
      SET color_token = CASE
        WHEN UPPER(code) = 'GC' THEN 'night'
        WHEN UPPER(code) = 'A'  THEN 'evening'
        WHEN UPPER(code) IN ('G','S') THEN 'day'
        WHEN CAST(substr(start_local_time, 1, 2) AS INTEGER) >= 5
          AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 13 THEN 'day'
        WHEN CAST(substr(start_local_time, 1, 2) AS INTEGER) >= 13
          AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 20 THEN 'evening'
        ELSE 'night'
      END
      WHERE color_token IS NULL OR trim(color_token) = '';
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export type MigrationResult = {
  previousVersion: number;
  currentVersion: number;
  needsReset: boolean;
};

export async function runMigrations(database: MigrationDatabase): Promise<MigrationResult> {
  return withDatabaseOperation(database, async () => {
    const initialVersion = await getSchemaVersion(database);

    if (initialVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        'Database schema version ' + initialVersion +
        ' is newer than supported version ' + CURRENT_SCHEMA_VERSION + '.',
      );
    }

    // Eski Vardiyam şeması (1–9) veya yeni şemadan önceki herhangi bir sürüm: güvenle sıfırla.
    if (initialVersion > 0 && initialVersion < FIRST_SCHEMA_VERSION) {
      return { previousVersion: initialVersion, currentVersion: initialVersion, needsReset: true };
    }

    if (initialVersion === CURRENT_SCHEMA_VERSION) {
      return { previousVersion: initialVersion, currentVersion: initialVersion, needsReset: false };
    }

    for (const migration of migrations) {
      const currentVersion = await getSchemaVersion(database);
      if (migration.version <= currentVersion) continue;

      if (migration.requiresFKOff) {
        // PRAGMA foreign_keys is a no-op inside a transaction; it must be set
        // before the transaction begins so DDL (DROP TABLE + RENAME) can run
        // without triggering FK constraint checks on referencing tables.
        await database.execAsync('PRAGMA foreign_keys = OFF;');
        try {
          await database.withTransactionAsync(async () => {
            await database.execAsync(migration.sql);
            await database.execAsync('PRAGMA user_version = ' + migration.version + ';');
          });
        } finally {
          await database.execAsync('PRAGMA foreign_keys = ON;');
        }
      } else {
        await database.withTransactionAsync(async () => {
          await database.execAsync(migration.sql);
          await database.execAsync('PRAGMA user_version = ' + migration.version + ';');
        });
      }
    }

    return { previousVersion: initialVersion, currentVersion: CURRENT_SCHEMA_VERSION, needsReset: false };
  });
}

async function getSchemaVersion(database: MigrationDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
    throw new Error('Could not read a valid SQLite schema version.');
  }
  return row.user_version;
}
