import type { SQLiteDatabase } from 'expo-sqlite';

import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS_INSERT_SQL } from './migrations.ts';
import { TABLES_BY_VERSION } from './backupValidation.ts';

type ResetDatabase = Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'withTransactionAsync'>;

// Delete order respects FK constraints: child tables before parent tables.
// cycle_entries: FK to shift_cycles (CASCADE) and shift_templates (RESTRICT)
// day_entries: FK to shift_templates (NO ACTION / implicit RESTRICT)
const DELETE_ORDER = [
  'cycle_entries',
  'day_entries',
  'extra_incomes',
  'shift_cycles',
  'shift_templates',
  'app_metadata',
  'settings',
];

export async function resetAllData(database: ResetDatabase): Promise<void> {
  const tables = TABLES_BY_VERSION[CURRENT_SCHEMA_VERSION];
  if (!tables) throw new Error('Geçerli şema sürümü için tablo listesi bulunamadı.');

  await database.execAsync('PRAGMA secure_delete = ON;');

  await database.withTransactionAsync(async () => {
    for (const table of DELETE_ORDER) {
      if (tables.includes(table)) {
        await database.execAsync(`DELETE FROM "${table}";`);
      }
    }
    await database.execAsync(DEFAULT_SETTINGS_INSERT_SQL);

    const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM settings;');
    if (row?.count !== 1) throw new Error('Sıfırlama sonrası varsayılan ayar satırı doğrulanamadı.');
  });

  await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  await database.execAsync('VACUUM;');
}

const WIPE_TEMP_NAME = '__vdywipe.db';
const MARKER_NAME = 'vardiyam-database-maintenance.json';

export async function cleanupLocalArtifacts(): Promise<void> {
  try {
    const { deleteDatabaseAsync } = await import('expo-sqlite');
    await deleteDatabaseAsync(WIPE_TEMP_NAME).catch(() => {});
  } catch {}
  try {
    const { File, Paths } = await import('expo-file-system');
    const marker = new File(Paths.document, MARKER_NAME);
    if (marker.exists) marker.delete();
    const temp = new File(Paths.document, `${MARKER_NAME}.tmp`);
    if (temp.exists) temp.delete();
  } catch {}
}
