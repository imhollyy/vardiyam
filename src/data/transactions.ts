import type { SQLiteDatabase } from 'expo-sqlite';

type TransactionDatabase = Pick<SQLiteDatabase, 'withTransactionAsync'>;

const databaseQueues = new WeakMap<object, Promise<void>>();
const retiredDatabases = new WeakSet<object>();

export function retireDatabaseHandle(database: object): void {
  retiredDatabases.add(database);
}

/**
 * Serializes all repository reads, migrations, and writes for the same handle.
 * Expo's non-exclusive async transaction can otherwise capture unrelated queries
 * issued on that connection while it is active.
 */
export async function withDatabaseOperation<T>(
  database: object,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = databaseQueues.get(database) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  databaseQueues.set(database, current);

  await previous;

  try {
    if (retiredDatabases.has(database)) {
      throw new Error('The local database was replaced. Reload the current screen before retrying.');
    }
    return await operation();
  } finally {
    release?.();
    if (databaseQueues.get(database) === current) {
      databaseQueues.delete(database);
    }
  }
}

export async function withDatabaseTransaction<T>(
  database: TransactionDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  let result!: T;

  await withDatabaseOperation(database, async () => {
    await database.withTransactionAsync(async () => {
      result = await operation();
    });
  });

  return result;
}
