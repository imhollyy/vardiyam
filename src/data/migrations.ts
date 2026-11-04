import type { SQLiteDatabase } from 'expo-sqlite';

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
];

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

export async function runMigrations(database: MigrationDatabase): Promise<void> {
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
      await database.execAsync(`PRAGMA user_version = ${migration.version};`);
    }
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
      `Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
    );
  }
}
