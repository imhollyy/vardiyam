import type { SQLiteDatabase } from 'expo-sqlite';

import { CURRENT_SCHEMA_VERSION, migrations, runMigrations } from './migrations.ts';

type ValidationDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'withTransactionAsync'
>;

export type ReferenceDatabase = { database: ValidationDatabase; close: () => Promise<void> };
export type ReferenceDatabaseFactory = () => Promise<ReferenceDatabase>;

const TABLES_BY_VERSION: Record<number, readonly string[]> = {
  1: ['app_metadata'],
  2: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides'],
  3: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records'],
  4: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals'],
  5: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots'],
  6: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots', 'payroll_periods', 'payslip_net_versions', 'net_payments', 'payment_allocations', 'payment_ledger_events'],
  7: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots', 'payroll_periods', 'payslip_net_versions', 'net_payments', 'payment_allocations', 'payment_ledger_events', 'active_work_sessions', 'work_day_statuses'],
  8: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots', 'payroll_periods', 'payslip_net_versions', 'net_payments', 'payment_allocations', 'payment_ledger_events', 'active_work_sessions', 'work_day_statuses', 'plan_time_overrides'],
  9: ['app_metadata', 'shift_templates', 'shift_cycles', 'cycle_entries', 'plan_overrides', 'work_records', 'break_intervals', 'earnings_profiles', 'earnings_rule_versions', 'earnings_snapshots', 'payroll_periods', 'payslip_net_versions', 'net_payments', 'payment_allocations', 'payment_ledger_events', 'active_work_sessions', 'work_day_statuses', 'plan_time_overrides', 'day_edit_notes'],
};

const CRITICAL_V6_TRIGGERS = [
  'cycle_entries_position_insert', 'cycle_entries_position_update',
  'break_intervals_validate_insert', 'break_intervals_validate_update', 'work_records_validate_existing_breaks',
  'earnings_snapshots_no_update', 'earnings_snapshots_no_delete', 'earnings_profiles_no_update', 'earnings_profiles_no_delete',
  'earnings_rules_no_update', 'earnings_rules_no_delete', 'payroll_periods_no_update', 'payroll_periods_no_delete',
  'payslip_net_versions_no_update', 'payslip_net_versions_no_delete', 'payment_allocations_limit_insert',
  'payment_allocations_limit_update', 'net_payments_allocation_limit', 'payment_ledger_events_no_update', 'payment_ledger_events_no_delete',
];

export type BackupDatabaseValidation = {
  schemaVersion: number;
  sqliteVersion: string;
  recordCount: number;
  migrated: boolean;
};

export async function validateBackupDatabase(
  database: ValidationDatabase,
  options: {
    createReferenceDatabase: ReferenceDatabaseFactory;
    migrateToCurrent?: boolean;
    expectedSchemaVersion?: number;
  },
): Promise<BackupDatabaseValidation> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  let version = await readSchemaVersion(database);
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) throw new Error('Bu yedek veritabanı sürümü desteklenmiyor.');
  if (options.expectedSchemaVersion !== undefined && options.expectedSchemaVersion !== version) {
    throw new Error('Yedek dosyasındaki sürüm bilgisi veritabanıyla eşleşmiyor.');
  }
  await verifyDatabaseIntegrity(database);
  await verifyRequiredSchema(database, version, options.createReferenceDatabase);

  const migrated = options.migrateToCurrent === true && version < CURRENT_SCHEMA_VERSION;
  if (migrated) {
    await runMigrations(database);
    version = await readSchemaVersion(database);
    if (version !== CURRENT_SCHEMA_VERSION) throw new Error('Yedek veritabanı güncel şemaya taşınamadı.');
    await verifyDatabaseIntegrity(database);
    await verifyRequiredSchema(database, version, options.createReferenceDatabase);
  }

  const sqlite = await database.getFirstAsync<{ version: string }>('SELECT sqlite_version() AS version;');
  if (!sqlite || !/^\d+\.\d+\.\d+$/.test(sqlite.version)) throw new Error('SQLite sürümü doğrulanamadı.');
  const tableNames = TABLES_BY_VERSION[version]!;
  const counts = await Promise.all(tableNames.map(async (table) => {
    const row = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}";`);
    return row?.count ?? 0;
  }));
  return { schemaVersion: version, sqliteVersion: sqlite.version, recordCount: counts.reduce((total, count) => total + count, 0), migrated };
}

async function readSchemaVersion(database: ValidationDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  if (!row || !Number.isInteger(row.user_version)) throw new Error('Yedekte geçerli şema sürümü yok.');
  return row.user_version;
}

async function verifyDatabaseIntegrity(database: ValidationDatabase): Promise<void> {
  const integrity = await database.getAllAsync<{ integrity_check: string }>('PRAGMA integrity_check;');
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('Yedek SQLite bütünlük kontrolünden geçemedi.');
  const foreignKeys = await database.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check;');
  if (foreignKeys.length !== 0) throw new Error('Yedekte ilişkisiz veya bozuk kayıtlar var.');
}

async function verifyRequiredSchema(
  database: ValidationDatabase,
  version: number,
  createReferenceDatabase: ReferenceDatabaseFactory,
): Promise<void> {
  const tables = TABLES_BY_VERSION[version]!;
  for (const table of tables) {
    const found = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
      table,
    );
    if (!found) throw new Error('Yedekte gerekli tablolar eksik.');
  }
  if (version >= 6) {
    for (const trigger of CRITICAL_V6_TRIGGERS) {
      const found = await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?;",
        trigger,
      );
      if (!found) throw new Error('Yedekte gerekli veri koruma kuralları eksik.');
    }
  }
  await verifyCanonicalSchema(database, version, createReferenceDatabase);
}

async function verifyCanonicalSchema(
  database: ValidationDatabase,
  version: number,
  createReferenceDatabase: ReferenceDatabaseFactory,
): Promise<void> {
  const reference = await createReferenceDatabase();
  try {
    await reference.database.execAsync('PRAGMA foreign_keys = ON;');
    for (const migration of migrations.slice(0, version)) {
      await reference.database.execAsync(migration.sql);
      await reference.database.execAsync(`PRAGMA user_version = ${migration.version};`);
    }
    const [actual, expected] = await Promise.all([
      getSchemaObjects(database),
      getSchemaObjects(reference.database),
    ]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('Yedek veritabanının tabloları, ilişkileri veya koruma kuralları uygulama şemasıyla eşleşmiyor.');
    }
  } finally {
    await reference.close();
  }
}

async function getSchemaObjects(database: ValidationDatabase): Promise<{ type: string; name: string; tableName: string; sql: string | null }[]> {
  const rows = await database.getAllAsync<{ type: string; name: string; tbl_name: string; sql: string | null }>(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;",
  );
  return rows.map((row) => ({ type: row.type, name: row.name, tableName: row.tbl_name, sql: row.sql }));
}
