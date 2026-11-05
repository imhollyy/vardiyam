import type { SQLiteDatabase } from 'expo-sqlite';

import { reconcileNetPayments, validateLocalDate, type PaymentMethod, type PayrollPeriodIdentity, type PaymentReconciliation } from '../domain/payments.ts';
import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type PaymentDatabase = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withTransactionAsync'>;
export type NetPayment = {
  id: string; paymentLocalDate: string; amountMinor: number; method: PaymentMethod; description: string | null;
  deletedAtUtc: string | null; unallocatedMinor: number;
};
export type PayrollPeriod = PayrollPeriodIdentity;
export type PeriodPaymentRow = { id: string; paymentLocalDate: string; paymentAmountMinor: number; method: PaymentMethod; description: string | null; deletedAtUtc: string | null; unallocatedMinor: number; allocationId: string; amountMinor: number };

export class PaymentStorageError extends Error {
  readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'ALLOCATION_LIMIT' | 'INTEGRITY';
  constructor(code: 'INVALID_INPUT' | 'NOT_FOUND' | 'ALLOCATION_LIMIT' | 'INTEGRITY', message: string) {
    super(message); this.code = code; this.name = 'PaymentStorageError';
  }
}

function validateAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new PaymentStorageError('INVALID_INPUT', 'Tutar pozitif, kuruş cinsinden güvenli tam sayı olmalı.');
}
function validateUtc(value: string): void {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new PaymentStorageError('INVALID_INPUT', 'Geçerli UTC dakika zamanı gerekli.');
  }
}
function requiredText(value: string, label: string, max: number): void {
  if (!value.trim() || value.length > max) throw new PaymentStorageError('INVALID_INPUT', `${label} gerekli ve en çok ${max} karakter olmalı.`);
}
function optionalText(value: string | null, max: number): void {
  if (value !== null && value.length > max) throw new PaymentStorageError('INVALID_INPUT', `Açıklama en çok ${max} karakter olabilir.`);
}
async function event(database: PaymentDatabase, id: string, entityType: string, entityId: string, eventType: string, at: string, payload: unknown): Promise<void> {
  await database.runAsync('INSERT INTO payment_ledger_events(id, entity_type, entity_id, event_type, event_at_utc, data_json) VALUES (?, ?, ?, ?, ?, ?);',
    id, entityType, entityId, eventType, at, JSON.stringify(payload));
}

export async function getOrCreatePayrollPeriod(database: PaymentDatabase, period: PayrollPeriod): Promise<PayrollPeriod> {
  validateLocalDate(period.startLocalDate); validateLocalDate(period.endExclusiveLocalDate);
  requiredText(period.id, 'Dönem kimliği', 200); requiredText(period.timezone, 'Saat dilimi', 100);
  try { new Intl.DateTimeFormat('en-US', { timeZone: period.timezone }); } catch { throw new PaymentStorageError('INVALID_INPUT', 'Geçerli IANA saat dilimi gerekli.'); }
  if (period.endExclusiveLocalDate <= period.startLocalDate || !Number.isInteger(period.configuredStartDay) || period.configuredStartDay < 1 || period.configuredStartDay > 31) {
    throw new PaymentStorageError('INVALID_INPUT', 'Bordro dönemi sınırları geçersiz.');
  }
  const now = new Date(); now.setUTCSeconds(0, 0); const createdAt = now.toISOString();
  return withDatabaseTransaction(database, async () => {
    const existing = await database.getFirstAsync<PayrollPeriod>('SELECT id, start_local_date AS startLocalDate, end_exclusive_local_date AS endExclusiveLocalDate, timezone, configured_start_day AS configuredStartDay FROM payroll_periods WHERE start_local_date=? AND end_exclusive_local_date=? AND timezone=?;', period.startLocalDate, period.endExclusiveLocalDate, period.timezone);
    if (existing) return existing;
    await database.runAsync('INSERT INTO payroll_periods(id, start_local_date, end_exclusive_local_date, timezone, configured_start_day, created_at_utc) VALUES (?, ?, ?, ?, ?, ?);', period.id, period.startLocalDate, period.endExclusiveLocalDate, period.timezone, period.configuredStartDay, createdAt);
    return period;
  });
}

export async function listPayrollPeriods(database: PaymentDatabase): Promise<PayrollPeriod[]> {
  return withDatabaseOperation(database, async () => database.getAllAsync<PayrollPeriod>('SELECT id, start_local_date AS startLocalDate, end_exclusive_local_date AS endExclusiveLocalDate, timezone, configured_start_day AS configuredStartDay FROM payroll_periods ORDER BY start_local_date DESC;'));
}

export async function getLatestPayslipNet(database: PaymentDatabase, periodId: string): Promise<{ version: number; amountMinor: number; note: string | null; createdAtUtc: string } | null> {
  return withDatabaseOperation(database, async () => (await database.getFirstAsync(
    'SELECT version, amount_minor AS amountMinor, note, created_at_utc AS createdAtUtc FROM payslip_net_versions WHERE period_id=? ORDER BY version DESC LIMIT 1;', periodId,
  )) ?? null);
}

export async function listPayslipNetVersions(database: PaymentDatabase, periodId: string): Promise<{ version: number; amountMinor: number; note: string | null; createdAtUtc: string }[]> {
  return withDatabaseOperation(database, async () => database.getAllAsync('SELECT version, amount_minor AS amountMinor, note, created_at_utc AS createdAtUtc FROM payslip_net_versions WHERE period_id=? ORDER BY version DESC;', periodId));
}

export async function savePayslipNet(database: PaymentDatabase, input: { periodId: string; amountMinor: number; note: string | null; atUtc: string; eventId: string }): Promise<number> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) throw new PaymentStorageError('INVALID_INPUT', 'Bordro neti sıfır veya pozitif güvenli kuruş tam sayısı olmalı.');
  validateUtc(input.atUtc); requiredText(input.periodId, 'Dönem kimliği', 200); requiredText(input.eventId, 'Olay kimliği', 200); optionalText(input.note, 2000);
  return withDatabaseTransaction(database, async () => {
    if (!await database.getFirstAsync('SELECT id FROM payroll_periods WHERE id=?;', input.periodId)) throw new PaymentStorageError('NOT_FOUND', 'Bordro dönemi bulunamadı.');
    const row = await database.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM payslip_net_versions WHERE period_id=?;', input.periodId);
    const version = (row?.version ?? 0) + 1;
    await database.runAsync('INSERT INTO payslip_net_versions(period_id, version, amount_minor, note, created_at_utc) VALUES (?, ?, ?, ?, ?);', input.periodId, version, input.amountMinor, input.note, input.atUtc);
    await event(database, input.eventId, 'PAYSLIP_NET', input.periodId, version === 1 ? 'CREATE' : 'REVISION', input.atUtc, { version, amountMinor: input.amountMinor, note: input.note });
    return version;
  });
}

export async function createNetPayment(database: PaymentDatabase, input: { id: string; paymentLocalDate: string; amountMinor: number; method: PaymentMethod; description: string | null; atUtc: string; eventId: string }): Promise<void> {
  validateLocalDate(input.paymentLocalDate); validateAmount(input.amountMinor); validateUtc(input.atUtc);
  requiredText(input.id, 'Ödeme kimliği', 200); requiredText(input.eventId, 'Olay kimliği', 200); optionalText(input.description, 2000);
  if (!['BANK', 'CASH', 'OTHER'].includes(input.method)) throw new PaymentStorageError('INVALID_INPUT', 'Ödeme yöntemi geçersiz.');
  await withDatabaseTransaction(database, async () => {
    await database.runAsync('INSERT INTO net_payments(id, payment_local_date, amount_minor, method, description, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?);', input.id, input.paymentLocalDate, input.amountMinor, input.method, input.description, input.atUtc, input.atUtc);
    await event(database, input.eventId, 'PAYMENT', input.id, 'CREATE', input.atUtc, input);
  });
}

export async function updateNetPayment(database: PaymentDatabase, input: { id: string; paymentLocalDate: string; amountMinor: number; method: PaymentMethod; description: string | null; atUtc: string; eventId: string }): Promise<void> {
  validateLocalDate(input.paymentLocalDate); validateAmount(input.amountMinor); validateUtc(input.atUtc); optionalText(input.description, 2000);
  if (!['BANK', 'CASH', 'OTHER'].includes(input.method)) throw new PaymentStorageError('INVALID_INPUT', 'Ödeme yöntemi geçersiz.');
  await withDatabaseTransaction(database, async () => {
    const result = await database.runAsync('UPDATE net_payments SET payment_local_date=?, amount_minor=?, method=?, description=?, updated_at_utc=? WHERE id=? AND deleted_at_utc IS NULL;', input.paymentLocalDate, input.amountMinor, input.method, input.description, input.atUtc, input.id);
    if (result.changes !== 1) throw new PaymentStorageError('NOT_FOUND', 'Düzenlenecek ödeme bulunamadı.');
    await event(database, input.eventId, 'PAYMENT', input.id, 'UPDATE', input.atUtc, input);
  }).catch((error) => {
    if (String(error).includes('payment amount is below allocated total')) throw new PaymentStorageError('ALLOCATION_LIMIT', 'Yeni tutar mevcut dönem dağıtımlarının altına inemez. Önce dağıtımları düzenle.');
    throw error;
  });
}

export async function deleteNetPayment(database: PaymentDatabase, input: { id: string; atUtc: string; eventId: string }): Promise<void> {
  validateUtc(input.atUtc);
  await withDatabaseTransaction(database, async () => {
    const result = await database.runAsync('UPDATE net_payments SET deleted_at_utc=?, updated_at_utc=? WHERE id=? AND deleted_at_utc IS NULL;', input.atUtc, input.atUtc, input.id);
    if (result.changes !== 1) throw new PaymentStorageError('NOT_FOUND', 'Silinecek ödeme bulunamadı.');
    await event(database, input.eventId, 'PAYMENT', input.id, 'DELETE', input.atUtc, { id: input.id, allocationsPreservedForAudit: true });
  });
}

export async function allocatePayment(database: PaymentDatabase, input: { id: string; paymentId: string; periodId: string; amountMinor: number; atUtc: string; eventId: string }): Promise<void> {
  validateAmount(input.amountMinor); validateUtc(input.atUtc);
  await withDatabaseTransaction(database, async () => {
    await database.runAsync('INSERT INTO payment_allocations(id, payment_id, period_id, amount_minor, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?);', input.id, input.paymentId, input.periodId, input.amountMinor, input.atUtc, input.atUtc);
    await event(database, input.eventId, 'ALLOCATION', input.id, 'CREATE', input.atUtc, input);
  }).catch((error) => {
    if (String(error).includes('payment allocations exceed payment amount')) throw new PaymentStorageError('ALLOCATION_LIMIT', 'Dönemlere dağıtılan toplam ödeme tutarı toplam ödemeyi aşamaz.');
    throw error;
  });
}

export async function updateAllocation(database: PaymentDatabase, input: { id: string; amountMinor: number; periodId: string; atUtc: string; eventId: string }): Promise<void> {
  validateAmount(input.amountMinor); validateUtc(input.atUtc);
  await withDatabaseTransaction(database, async () => {
    const result = await database.runAsync('UPDATE payment_allocations SET amount_minor=?, period_id=?, updated_at_utc=? WHERE id=?;', input.amountMinor, input.periodId, input.atUtc, input.id);
    if (result.changes !== 1) throw new PaymentStorageError('NOT_FOUND', 'Dağıtım bulunamadı.');
    await event(database, input.eventId, 'ALLOCATION', input.id, 'UPDATE', input.atUtc, input);
  }).catch((error) => {
    if (String(error).includes('payment allocations exceed payment amount')) throw new PaymentStorageError('ALLOCATION_LIMIT', 'Dağıtım toplamı ödeme tutarını aşamaz.');
    throw error;
  });
}

export async function deleteAllocation(database: PaymentDatabase, input: { id: string; atUtc: string; eventId: string }): Promise<void> {
  validateUtc(input.atUtc);
  await withDatabaseTransaction(database, async () => {
    const old = await database.getFirstAsync('SELECT id, payment_id AS paymentId, period_id AS periodId, amount_minor AS amountMinor FROM payment_allocations WHERE id=?;', input.id);
    if (!old) throw new PaymentStorageError('NOT_FOUND', 'Dağıtım bulunamadı.');
    await database.runAsync('DELETE FROM payment_allocations WHERE id=?;', input.id);
    await event(database, input.eventId, 'ALLOCATION', input.id, 'DELETE', input.atUtc, old);
  });
}

export async function listNetPayments(database: PaymentDatabase): Promise<NetPayment[]> {
  return withDatabaseOperation(database, async () => database.getAllAsync<NetPayment>(`SELECT p.id, p.payment_local_date AS paymentLocalDate, p.amount_minor AS amountMinor, p.method, p.description, p.deleted_at_utc AS deletedAtUtc,
    p.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM payment_allocations a WHERE a.payment_id=p.id), 0) AS unallocatedMinor
    FROM net_payments p ORDER BY p.payment_local_date DESC, p.created_at_utc DESC;`));
}

export async function getPeriodPaymentLedger(database: PaymentDatabase, periodId: string): Promise<{ statement: Awaited<ReturnType<typeof getLatestPayslipNet>>; reconciliation: PaymentReconciliation; rows: PeriodPaymentRow[] }> {
  return withDatabaseOperation(database, async () => {
    const statement = await database.getFirstAsync<{ version: number; amountMinor: number; note: string | null; createdAtUtc: string }>('SELECT version, amount_minor AS amountMinor, note, created_at_utc AS createdAtUtc FROM payslip_net_versions WHERE period_id=? ORDER BY version DESC LIMIT 1;', periodId) ?? null;
    // The unassigned balance is global; only explicit allocations belong to this period.
    const rows = await database.getAllAsync<PeriodPaymentRow>(`SELECT p.id, p.payment_local_date AS paymentLocalDate, p.amount_minor AS amountMinor, p.method,
      p.description, p.deleted_at_utc AS deletedAtUtc, p.amount_minor - COALESCE((SELECT SUM(a2.amount_minor) FROM payment_allocations a2 WHERE a2.payment_id=p.id),0) AS unallocatedMinor,
      a.id AS allocationId, a.amount_minor AS amountMinor
      FROM payment_allocations a JOIN net_payments p ON p.id=a.payment_id WHERE a.period_id=? AND p.deleted_at_utc IS NULL ORDER BY p.payment_local_date DESC, p.id;`, periodId);
    const allActive = await database.getFirstAsync<{ unallocated: number }>(`SELECT COALESCE(SUM(p.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM payment_allocations a WHERE a.payment_id=p.id),0)),0) AS unallocated FROM net_payments p WHERE p.deleted_at_utc IS NULL;`);
    const allAllocations = await database.getFirstAsync<{ allocated: number }>('SELECT COALESCE(SUM(amount_minor),0) AS allocated FROM payment_allocations WHERE period_id=? AND payment_id IN (SELECT id FROM net_payments WHERE deleted_at_utc IS NULL);', periodId);
    return { statement, reconciliation: reconcileNetPayments(statement?.amountMinor ?? null, allAllocations?.allocated ?? 0, allActive?.unallocated ?? 0), rows };
  });
}

export async function getPaymentHistoryCount(database: PaymentDatabase, entityId: string): Promise<number> {
  return withDatabaseOperation(database, async () => (await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM payment_ledger_events WHERE entity_id=?;', entityId))?.count ?? 0);
}
