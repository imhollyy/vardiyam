import type { SQLiteDatabase } from 'expo-sqlite';

import { runMigrations } from './migrations.ts';

export async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(database);
}
