import type { SQLiteDatabase } from 'expo-sqlite';

import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type ThemePreference = 'light' | 'dark';

export async function getThemePreference(database: SQLiteDatabase): Promise<ThemePreference> {
  return withDatabaseOperation(database, async () => {
    const row = await database.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = 'theme_mode';",
    );
    return row?.value === 'dark' ? 'dark' : 'light';
  });
}

export async function saveThemePreference(
  database: SQLiteDatabase,
  preference: ThemePreference,
): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await database.runAsync(
      `INSERT INTO app_metadata (key, value) VALUES ('theme_mode', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      preference,
    );
  });
}
