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

function canonicalUtcMinuteCheck(column: string): string {
  return `
    length(${column}) = 24
    AND ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:00.000Z'
    AND julianday(${column}) IS NOT NULL
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
    AND CAST(substr(${column}, 12, 2) AS INTEGER) BETWEEN 0 AND 23
    AND CAST(substr(${column}, 15, 2) AS INTEGER) BETWEEN 0 AND 59
  `;
}

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
  {
    version: 4,
    sql: `
      CREATE TABLE break_intervals (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        work_record_id TEXT NOT NULL,
        started_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('started_at_utc')}),
        ended_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('ended_at_utc')}),
        FOREIGN KEY (work_record_id) REFERENCES work_records(id) ON DELETE CASCADE,
        CHECK (julianday(ended_at_utc) > julianday(started_at_utc)),
        UNIQUE (work_record_id, started_at_utc, ended_at_utc)
      );

      CREATE INDEX break_intervals_work_record_start_idx
        ON break_intervals(work_record_id, started_at_utc, id);

      CREATE TRIGGER break_intervals_validate_insert
      BEFORE INSERT ON break_intervals
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM work_records
          WHERE id = NEW.work_record_id
            AND julianday(NEW.started_at_utc) >= julianday(started_at_utc)
            AND julianday(NEW.ended_at_utc) <= julianday(ended_at_utc)
        ) THEN RAISE(ABORT, 'break interval outside work record') END;
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM break_intervals existing
          WHERE existing.work_record_id = NEW.work_record_id
            AND julianday(NEW.started_at_utc) < julianday(existing.ended_at_utc)
            AND julianday(NEW.ended_at_utc) > julianday(existing.started_at_utc)
        ) THEN RAISE(ABORT, 'overlapping break interval') END;
      END;

      CREATE TRIGGER break_intervals_validate_update
      BEFORE UPDATE OF work_record_id, started_at_utc, ended_at_utc ON break_intervals
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM work_records
          WHERE id = NEW.work_record_id
            AND julianday(NEW.started_at_utc) >= julianday(started_at_utc)
            AND julianday(NEW.ended_at_utc) <= julianday(ended_at_utc)
        ) THEN RAISE(ABORT, 'break interval outside work record') END;
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM break_intervals existing
          WHERE existing.work_record_id = NEW.work_record_id
            AND existing.id <> NEW.id
            AND julianday(NEW.started_at_utc) < julianday(existing.ended_at_utc)
            AND julianday(NEW.ended_at_utc) > julianday(existing.started_at_utc)
        ) THEN RAISE(ABORT, 'overlapping break interval') END;
      END;

      CREATE TRIGGER work_records_validate_existing_breaks
      BEFORE UPDATE OF started_at_utc, ended_at_utc, break_minutes ON work_records
      WHEN EXISTS (
        SELECT 1 FROM break_intervals WHERE work_record_id = OLD.id
      )
      BEGIN
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM break_intervals
          WHERE work_record_id = OLD.id
            AND (julianday(started_at_utc) < julianday(NEW.started_at_utc)
              OR julianday(ended_at_utc) > julianday(NEW.ended_at_utc))
        ) THEN RAISE(ABORT, 'work record update would exclude break interval') END;
        SELECT CASE WHEN NEW.break_minutes <> (
          SELECT COALESCE(SUM(
            (CAST(strftime('%s', ended_at_utc) AS INTEGER) - CAST(strftime('%s', started_at_utc) AS INTEGER)) / 60
          ), 0)
          FROM break_intervals WHERE work_record_id = OLD.id
        ) THEN RAISE(ABORT, 'work record update would mismatch break total') END;
      END;
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE earnings_profiles (
        id TEXT NOT NULL CHECK (length(trim(id)) > 0),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
        PRIMARY KEY(id, version)
      );
      CREATE INDEX earnings_profiles_latest_idx ON earnings_profiles(id, version DESC);

      CREATE TABLE earnings_rule_versions (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        profile_id TEXT NOT NULL,
        profile_version INTEGER NOT NULL CHECK (profile_version > 0),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
        FOREIGN KEY(profile_id, profile_version) REFERENCES earnings_profiles(id, version) ON DELETE RESTRICT,
        UNIQUE(profile_id, version)
      );
      CREATE INDEX earnings_rule_versions_latest_idx ON earnings_rule_versions(profile_id, version DESC);

      CREATE TABLE earnings_snapshots (
        calculation_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(calculation_id)) > 0),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        profile_id TEXT NOT NULL,
        profile_version INTEGER NOT NULL CHECK (profile_version > 0),
        rule_version_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status = 'COMPLETE'),
        total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
        input_json TEXT NOT NULL CHECK (json_valid(input_json)),
        snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
        FOREIGN KEY(profile_id, profile_version) REFERENCES earnings_profiles(id, version) ON DELETE RESTRICT,
        FOREIGN KEY(rule_version_id) REFERENCES earnings_rule_versions(id) ON DELETE RESTRICT
      );
      CREATE INDEX earnings_snapshots_period_idx ON earnings_snapshots(created_at_utc DESC, calculation_id);
      CREATE TRIGGER earnings_snapshots_no_update
        BEFORE UPDATE ON earnings_snapshots BEGIN SELECT RAISE(ABORT, 'earnings snapshots are immutable'); END;
      CREATE TRIGGER earnings_snapshots_no_delete
        BEFORE DELETE ON earnings_snapshots BEGIN SELECT RAISE(ABORT, 'earnings snapshots are immutable'); END;
      CREATE TRIGGER earnings_profiles_no_update
        BEFORE UPDATE ON earnings_profiles BEGIN SELECT RAISE(ABORT, 'earnings profile versions are immutable'); END;
      CREATE TRIGGER earnings_profiles_no_delete
        BEFORE DELETE ON earnings_profiles BEGIN SELECT RAISE(ABORT, 'earnings profile versions are immutable'); END;
      CREATE TRIGGER earnings_rules_no_update
        BEFORE UPDATE ON earnings_rule_versions BEGIN SELECT RAISE(ABORT, 'earnings rule versions are immutable'); END;
      CREATE TRIGGER earnings_rules_no_delete
        BEFORE DELETE ON earnings_rule_versions BEGIN SELECT RAISE(ABORT, 'earnings rule versions are immutable'); END;
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE payroll_periods (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        start_local_date TEXT NOT NULL CHECK (length(start_local_date) = 10 AND julianday(start_local_date) IS NOT NULL),
        end_exclusive_local_date TEXT NOT NULL CHECK (length(end_exclusive_local_date) = 10 AND julianday(end_exclusive_local_date) IS NOT NULL),
        timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
        configured_start_day INTEGER NOT NULL CHECK (configured_start_day BETWEEN 1 AND 31),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        CHECK (julianday(end_exclusive_local_date) > julianday(start_local_date)),
        UNIQUE(start_local_date, end_exclusive_local_date, timezone)
      );
      CREATE INDEX payroll_periods_recent_idx ON payroll_periods(start_local_date DESC);
      CREATE TRIGGER payroll_periods_no_update BEFORE UPDATE ON payroll_periods
        BEGIN SELECT RAISE(ABORT, 'payroll period identity is immutable'); END;
      CREATE TRIGGER payroll_periods_no_delete BEFORE DELETE ON payroll_periods
        BEGIN SELECT RAISE(ABORT, 'payroll period identity is immutable'); END;

      CREATE TABLE payslip_net_versions (
        period_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 0 AND 9007199254740991),
        note TEXT CHECK (note IS NULL OR length(note) <= 2000),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        PRIMARY KEY(period_id, version),
        FOREIGN KEY(period_id) REFERENCES payroll_periods(id) ON DELETE RESTRICT
      );
      CREATE TRIGGER payslip_net_versions_no_update BEFORE UPDATE ON payslip_net_versions
        BEGIN SELECT RAISE(ABORT, 'payslip net history is append-only'); END;
      CREATE TRIGGER payslip_net_versions_no_delete BEFORE DELETE ON payslip_net_versions
        BEGIN SELECT RAISE(ABORT, 'payslip net history is append-only'); END;

      CREATE TABLE net_payments (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        payment_local_date TEXT NOT NULL CHECK (length(payment_local_date) = 10 AND julianday(payment_local_date) IS NOT NULL),
        amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 9007199254740991),
        method TEXT NOT NULL CHECK (method IN ('BANK', 'CASH', 'OTHER')),
        description TEXT CHECK (description IS NULL OR length(description) <= 2000),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        updated_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('updated_at_utc')}),
        deleted_at_utc TEXT CHECK (deleted_at_utc IS NULL OR (${canonicalUtcMinuteCheck('deleted_at_utc')}))
      );
      CREATE INDEX net_payments_date_idx ON net_payments(payment_local_date DESC, id);

      CREATE TABLE payment_allocations (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        payment_id TEXT NOT NULL,
        period_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 9007199254740991),
        created_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('created_at_utc')}),
        updated_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('updated_at_utc')}),
        FOREIGN KEY(payment_id) REFERENCES net_payments(id) ON DELETE RESTRICT,
        FOREIGN KEY(period_id) REFERENCES payroll_periods(id) ON DELETE RESTRICT,
        UNIQUE(payment_id, period_id)
      );
      CREATE INDEX payment_allocations_period_idx ON payment_allocations(period_id, payment_id);
      CREATE TRIGGER payment_allocations_limit_insert BEFORE INSERT ON payment_allocations
      BEGIN
        SELECT CASE WHEN COALESCE((SELECT deleted_at_utc FROM net_payments WHERE id=NEW.payment_id), 'missing') <> 'missing'
          AND (SELECT deleted_at_utc FROM net_payments WHERE id=NEW.payment_id) IS NOT NULL
          THEN RAISE(ABORT, 'cannot allocate to a deleted or missing payment') END;
        SELECT CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payment_allocations WHERE payment_id=NEW.payment_id),0) + NEW.amount_minor >
          (SELECT amount_minor FROM net_payments WHERE id=NEW.payment_id) THEN RAISE(ABORT, 'payment allocations exceed payment amount') END;
      END;
      CREATE TRIGGER payment_allocations_limit_update BEFORE UPDATE OF payment_id, amount_minor ON payment_allocations
      BEGIN
        SELECT CASE WHEN COALESCE((SELECT deleted_at_utc FROM net_payments WHERE id=NEW.payment_id), 'missing') <> 'missing'
          AND (SELECT deleted_at_utc FROM net_payments WHERE id=NEW.payment_id) IS NOT NULL
          THEN RAISE(ABORT, 'cannot allocate to a deleted or missing payment') END;
        SELECT CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payment_allocations WHERE payment_id=NEW.payment_id AND id<>OLD.id),0) + NEW.amount_minor >
          (SELECT amount_minor FROM net_payments WHERE id=NEW.payment_id) THEN RAISE(ABORT, 'payment allocations exceed payment amount') END;
      END;
      CREATE TRIGGER net_payments_allocation_limit BEFORE UPDATE OF amount_minor ON net_payments
      BEGIN
        SELECT CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payment_allocations WHERE payment_id=OLD.id),0) > NEW.amount_minor
          THEN RAISE(ABORT, 'payment amount is below allocated total') END;
      END;

      CREATE TABLE payment_ledger_events (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('PAYSLIP_NET', 'PAYMENT', 'ALLOCATION')),
        entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
        event_type TEXT NOT NULL CHECK (event_type IN ('CREATE', 'UPDATE', 'DELETE', 'REVISION')),
        event_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('event_at_utc')}),
        data_json TEXT NOT NULL CHECK (json_valid(data_json))
      );
      CREATE INDEX payment_ledger_events_entity_idx ON payment_ledger_events(entity_type, entity_id, event_at_utc);
      CREATE TRIGGER payment_ledger_events_no_update BEFORE UPDATE ON payment_ledger_events
        BEGIN SELECT RAISE(ABORT, 'payment ledger history is immutable'); END;
      CREATE TRIGGER payment_ledger_events_no_delete BEFORE DELETE ON payment_ledger_events
        BEGIN SELECT RAISE(ABORT, 'payment ledger history is immutable'); END;
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE active_work_sessions (
        id TEXT PRIMARY KEY NOT NULL CHECK (id = 'active'),
        started_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('started_at_utc')}),
        started_local_date TEXT NOT NULL CHECK (${canonicalLocalDateCheck('started_local_date')}),
        timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
        planned_snapshot_json TEXT CHECK (planned_snapshot_json IS NULL OR json_valid(planned_snapshot_json))
      );

      CREATE TABLE work_day_statuses (
        local_date TEXT PRIMARY KEY NOT NULL CHECK (${canonicalLocalDateCheck('local_date')}),
        status TEXT NOT NULL CHECK (status IN ('LEAVE', 'SICK_REPORT', 'NOT_WORKED')),
        note TEXT CHECK (note IS NULL OR length(note) <= 2000),
        updated_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('updated_at_utc')})
      );
    `,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE plan_time_overrides (
        cycle_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        start_local_time TEXT NOT NULL CHECK (
          length(start_local_time) = 5 AND start_local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND CAST(substr(start_local_time, 1, 2) AS INTEGER) < 24
        ),
        end_local_time TEXT NOT NULL CHECK (
          length(end_local_time) = 5 AND end_local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND CAST(substr(end_local_time, 1, 2) AS INTEGER) < 24
        ),
        PRIMARY KEY(cycle_id, local_date),
        FOREIGN KEY(cycle_id, local_date) REFERENCES plan_overrides(cycle_id, local_date) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `,
  },
  {
    version: 9,
    sql: `
      CREATE TABLE day_edit_notes (
        local_date TEXT PRIMARY KEY NOT NULL CHECK (${canonicalLocalDateCheck('local_date')}),
        note TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 2000),
        updated_at_utc TEXT NOT NULL CHECK (${canonicalUtcMinuteCheck('updated_at_utc')})
      );
      INSERT INTO day_edit_notes (local_date, note, updated_at_utc)
        SELECT local_date, note, updated_at_utc FROM work_day_statuses WHERE note IS NOT NULL AND length(trim(note)) > 0;
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
