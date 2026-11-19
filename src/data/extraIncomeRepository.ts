import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExtraIncome, ExtraIncomeType, ExtraIncomeFrequency } from '../domain/payroll/types.ts';

type ExtraIncomeRow = {
  id: string;
  type: string;
  custom_name: string | null;
  amount_minor: number;
  frequency: string;
  first_payment_date: string | null;
  created_at: string;
};

function rowToIncome(row: ExtraIncomeRow): ExtraIncome {
  return {
    id: row.id,
    type: row.type as ExtraIncomeType,
    customName: row.custom_name,
    amountMinor: row.amount_minor,
    frequency: row.frequency as ExtraIncomeFrequency,
    firstPaymentDate: row.first_payment_date,
    createdAt: row.created_at,
  };
}

export async function getAllExtraIncomes(database: SQLiteDatabase): Promise<ExtraIncome[]> {
  const rows = await database.getAllAsync<ExtraIncomeRow>(
    'SELECT * FROM extra_incomes ORDER BY created_at DESC;',
  );
  return rows.map(rowToIncome);
}

export type CreateExtraIncomeInput = {
  type: ExtraIncomeType;
  customName?: string | null;
  amountMinor: number;
  frequency: ExtraIncomeFrequency;
  firstPaymentDate?: string | null;
};

export async function createExtraIncome(
  database: SQLiteDatabase,
  input: CreateExtraIncomeInput,
): Promise<ExtraIncome> {
  const id = randomUUID();
  await database.runAsync(
    `INSERT INTO extra_incomes (id, type, custom_name, amount_minor, frequency, first_payment_date)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [id, input.type, input.customName ?? null, input.amountMinor, input.frequency, input.firstPaymentDate ?? null],
  );
  const row = await database.getFirstAsync<ExtraIncomeRow>(
    'SELECT * FROM extra_incomes WHERE id = ?;',
    id,
  );
  if (!row) throw new Error('Ek gelir kaydedilemedi.');
  return rowToIncome(row);
}

export async function updateExtraIncome(
  database: SQLiteDatabase,
  id: string,
  input: Partial<CreateExtraIncomeInput>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.type !== undefined) { sets.push('type = ?'); values.push(input.type); }
  if (input.customName !== undefined) { sets.push('custom_name = ?'); values.push(input.customName); }
  if (input.amountMinor !== undefined) { sets.push('amount_minor = ?'); values.push(input.amountMinor); }
  if (input.frequency !== undefined) { sets.push('frequency = ?'); values.push(input.frequency); }
  if (input.firstPaymentDate !== undefined) { sets.push('first_payment_date = ?'); values.push(input.firstPaymentDate); }
  if (sets.length === 0) return;
  await database.runAsync(`UPDATE extra_incomes SET ${sets.join(', ')} WHERE id = ?;`, [...values, id]);
}

export async function deleteExtraIncome(database: SQLiteDatabase, id: string): Promise<void> {
  await database.runAsync('DELETE FROM extra_incomes WHERE id = ?;', id);
}
