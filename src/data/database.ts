import type { SQLiteDatabase } from 'expo-sqlite';

import { runMigrations, type MigrationResult } from './migrations.ts';

export async function initializeDatabase(database: SQLiteDatabase): Promise<MigrationResult> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  return runMigrations(database);
}
