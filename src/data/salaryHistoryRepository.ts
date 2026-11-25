import type { SQLiteDatabase } from 'expo-sqlite';

import type { SalaryHistoryEntry } from '../domain/payroll/salaryHistory.ts';

type Repo = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync' | 'withTransactionAsync'>;

type Row = {
  id: string;
  effective_from: string;
  salary_minor: number;
  created_at: string;
};

function rowToEntry(row: Row): SalaryHistoryEntry {
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    salaryMinor: row.salary_minor,
    createdAt: row.created_at,
  };
}

/** Returns all entries sorted ASC by effective_from. */
export async function getSalaryHistory(db: Repo): Promise<SalaryHistoryEntry[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT id, effective_from, salary_minor, created_at FROM salary_history ORDER BY effective_from ASC;',
  );
  return rows.map(rowToEntry);
}

/** Inserts or replaces an entry for the given date. */
export async function upsertSalaryEntry(
  db: Repo,
  entry: SalaryHistoryEntry,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO salary_history (id, effective_from, salary_minor, created_at) VALUES (?, ?, ?, ?);',
    entry.id,
    entry.effectiveFrom,
    entry.salaryMinor,
    entry.createdAt,
  );
}

/** Removes an entry by id. The seed row (the earliest) cannot be deleted if it's the only one. */
export async function deleteSalaryEntry(db: Repo, id: string): Promise<void> {
  await db.runAsync('DELETE FROM salary_history WHERE id = ?;', id);
}
