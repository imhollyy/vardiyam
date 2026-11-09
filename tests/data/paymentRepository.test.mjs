import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../../src/data/database.ts';
import { allocatePayment, createNetPayment, deleteAllocation, deleteNetPayment, getOrCreatePayrollPeriod, getPaymentHistoryCount, getPeriodPaymentLedger, getLatestPayslipNet, listNetPayments, savePayslipNet, updateAllocation, updateNetPayment, PaymentStorageError } from '../../src/data/paymentRepository.ts';

function setup(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  const database = {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) { sqlite.exec('BEGIN;'); try { await callback(); sqlite.exec('COMMIT;'); } catch (error) { sqlite.exec('ROLLBACK;'); throw error; } },
  };
  return { sqlite, database };
}
const stamp = (day = '05') => `2026-01-${day}T12:00:00.000Z`;
const period = (id, start, end) => ({ id, startLocalDate: start, endExclusiveLocalDate: end, timezone: 'Europe/Istanbul', configuredStartDay: 15 });

test('v6 payment ledger supports immutable statement revisions, multi-period payments and visible balance', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const p1 = await getOrCreatePayrollPeriod(database, period('p-2026-01', '2025-12-15', '2026-01-15'));
    const p2 = await getOrCreatePayrollPeriod(database, period('p-2026-02', '2026-01-15', '2026-02-15'));
    assert.equal(p1.id, 'p-2026-01');
    assert.equal(await getOrCreatePayrollPeriod(database, period('ignored-id', '2025-12-15', '2026-01-15')).then((x) => x.id), p1.id);
    await savePayslipNet(database, { periodId: p1.id, amountMinor: 3_500_000, note: 'synthetic', atUtc: stamp(), eventId: 'e-net-1' });
    await savePayslipNet(database, { periodId: p1.id, amountMinor: 3_600_000, note: 'revision', atUtc: stamp('06'), eventId: 'e-net-2' });
    assert.equal((await getLatestPayslipNet(database, p1.id)).version, 2);
    await createNetPayment(database, { id: 'pay-1', paymentLocalDate: '2026-01-20', amountMinor: 2_500_000, method: 'BANK', description: 'synthetic', atUtc: stamp(), eventId: 'e-pay-1' });
    await allocatePayment(database, { id: 'alloc-1', paymentId: 'pay-1', periodId: p1.id, amountMinor: 1_500_000, atUtc: stamp(), eventId: 'e-alloc-1' });
    await allocatePayment(database, { id: 'alloc-2', paymentId: 'pay-1', periodId: p2.id, amountMinor: 1_000_000, atUtc: stamp(), eventId: 'e-alloc-2' });
    const ledger = await getPeriodPaymentLedger(database, p1.id);
    assert.equal(ledger.reconciliation.payslipNetMinor, 3_600_000);
    assert.equal(ledger.reconciliation.allocatedPaymentMinor, 1_500_000);
    assert.equal(ledger.reconciliation.differenceMinor, 2_100_000);
    assert.equal(ledger.reconciliation.unallocatedPaymentMinor, 0);
    assert.equal(ledger.rows[0].amountMinor, 1_500_000);
    assert.equal((await listNetPayments(database))[0].unallocatedMinor, 0);
    assert.equal(await getPaymentHistoryCount(database, 'pay-1'), 1);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
  } finally { sqlite.close(); }
});

test('35,000 TL payslip reconciles exactly against 30,000 TL bank and 5,000 TL cash payments', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const p = await getOrCreatePayrollPeriod(database, period('p-35k', '2026-01-01', '2026-02-01'));
    await savePayslipNet(database, { periodId: p.id, amountMinor: 3_500_000, note: null, atUtc: stamp(), eventId: 'a' });
    await createNetPayment(database, { id: 'bank-30k', paymentLocalDate: '2026-02-05', amountMinor: 3_000_000, method: 'BANK', description: null, atUtc: stamp(), eventId: 'b' });
    await allocatePayment(database, { id: 'bank-allocation', paymentId: 'bank-30k', periodId: p.id, amountMinor: 3_000_000, atUtc: stamp(), eventId: 'c' });
    await createNetPayment(database, { id: 'cash-5k', paymentLocalDate: '2026-02-06', amountMinor: 500_000, method: 'CASH', description: null, atUtc: stamp(), eventId: 'd' });
    await allocatePayment(database, { id: 'cash-allocation', paymentId: 'cash-5k', periodId: p.id, amountMinor: 500_000, atUtc: stamp(), eventId: 'e' });
    const ledger = await getPeriodPaymentLedger(database, p.id);
    assert.equal(ledger.reconciliation.allocatedPaymentMinor, 3_500_000);
    assert.equal(ledger.reconciliation.differenceMinor, 0);
    assert.equal(ledger.rows.length, 2);
  } finally { sqlite.close(); }
});

test('changing the payroll period rule creates a distinct frozen period and does not move old allocations', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const oldPeriod = await getOrCreatePayrollPeriod(database, period('period-day-1', '2026-01-01', '2026-02-01'));
    const newPeriod = await getOrCreatePayrollPeriod(database, period('period-day-15', '2026-01-15', '2026-02-15'));
    await createNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-10', amountMinor: 10_000, method: 'BANK', description: null, atUtc: stamp(), eventId: 'e1' });
    await allocatePayment(database, { id: 'a', paymentId: 'pay', periodId: oldPeriod.id, amountMinor: 10_000, atUtc: stamp(), eventId: 'e2' });
    assert.notEqual(oldPeriod.id, newPeriod.id);
    assert.equal((await getPeriodPaymentLedger(database, oldPeriod.id)).reconciliation.allocatedPaymentMinor, 10_000);
    assert.equal((await getPeriodPaymentLedger(database, newPeriod.id)).reconciliation.allocatedPaymentMinor, 0);
    assert.equal(sqlite.prepare('SELECT start_local_date FROM payroll_periods WHERE id=?').get(oldPeriod.id).start_local_date, '2026-01-01');
  } finally { sqlite.close(); }
});

test('allocation bounds hold on create/update and failed transaction preserves ledger', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const p = await getOrCreatePayrollPeriod(database, period('p', '2026-01-01', '2026-02-01'));
    await createNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-03', amountMinor: 2_500_000, method: 'CASH', description: null, atUtc: stamp(), eventId: 'e1' });
    await allocatePayment(database, { id: 'a1', paymentId: 'pay', periodId: p.id, amountMinor: 1_500_000, atUtc: stamp(), eventId: 'e2' });
    await assert.rejects(allocatePayment(database, { id: 'a2', paymentId: 'pay', periodId: p.id, amountMinor: 1_000_000, atUtc: stamp(), eventId: 'e3' }), /UNIQUE/);
    const p2 = await getOrCreatePayrollPeriod(database, period('p2', '2026-02-01', '2026-03-01'));
    await assert.rejects(allocatePayment(database, { id: 'a2', paymentId: 'pay', periodId: p2.id, amountMinor: 1_000_001, atUtc: stamp(), eventId: 'e3' }), (error) => error instanceof PaymentStorageError && error.code === 'ALLOCATION_LIMIT');
    await allocatePayment(database, { id: 'a2', paymentId: 'pay', periodId: p2.id, amountMinor: 1_000_000, atUtc: stamp(), eventId: 'e4' });
    await updateNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-04', amountMinor: 2_500_000, method: 'BANK', description: 'edited synthetic', atUtc: stamp('06'), eventId: 'e5' });
    await assert.rejects(updateNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-03', amountMinor: 2_499_999, method: 'CASH', description: null, atUtc: stamp('06'), eventId: 'e5' }), (error) => error instanceof PaymentStorageError && error.code === 'ALLOCATION_LIMIT');
    assert.equal((await listNetPayments(database))[0].amountMinor, 2_500_000);
    await assert.rejects(deleteNetPayment(database, { id: 'pay', atUtc: stamp('07'), eventId: 'e6' }).then(async () => {
      await allocatePayment(database, { id: 'a3', paymentId: 'pay', periodId: p.id, amountMinor: 1, atUtc: stamp(), eventId: 'e7' });
    }));
    assert.equal((await listNetPayments(database))[0].deletedAtUtc, stamp('07'));
    assert.equal(await getPaymentHistoryCount(database, 'pay'), 3);
    assert.throws(() => sqlite.prepare('UPDATE payment_ledger_events SET data_json=?').run('{}'), /immutable/);
  } finally { sqlite.close(); }
});

test('allocation edit/delete, statement unknown and close/reopen persistence', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const p = await getOrCreatePayrollPeriod(database, period('p', '2026-01-01', '2026-02-01'));
    assert.equal((await getPeriodPaymentLedger(database, p.id)).reconciliation.differenceMinor, null);
    await createNetPayment(database, { id: 'pay', paymentLocalDate: '2026-01-31', amountMinor: 5_000, method: 'OTHER', description: null, atUtc: stamp(), eventId: 'e1' });
    await allocatePayment(database, { id: 'a', paymentId: 'pay', periodId: p.id, amountMinor: 3_000, atUtc: stamp(), eventId: 'e2' });
    assert.equal((await getPeriodPaymentLedger(database, p.id)).reconciliation.unallocatedPaymentMinor, 2_000);
    await updateAllocation(database, { id: 'a', amountMinor: 4_000, periodId: p.id, atUtc: stamp('06'), eventId: 'e3' });
    await deleteAllocation(database, { id: 'a', atUtc: stamp('07'), eventId: 'e4' });
    await savePayslipNet(database, { periodId: p.id, amountMinor: 5_000, note: null, atUtc: stamp('08'), eventId: 'e5' });
    assert.equal((await getPeriodPaymentLedger(database, p.id)).reconciliation.differenceMinor, 5_000);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM payslip_net_versions').get().count, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM payment_ledger_events').get().count, 5);
  } finally { sqlite.close(); }
});

test('serialized concurrent writes cannot overallocate; failed audit insert rolls back the allocation', async () => {
  const { sqlite, database } = setup();
  try {
    await initializeDatabase(database);
    const p1 = await getOrCreatePayrollPeriod(database, period('p1', '2026-01-01', '2026-02-01'));
    const p2 = await getOrCreatePayrollPeriod(database, period('p2', '2026-02-01', '2026-03-01'));
    await createNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-01', amountMinor: 10_000, method: 'BANK', description: null, atUtc: stamp(), eventId: 'payment-event' });
    const attempts = await Promise.allSettled([
      allocatePayment(database, { id: 'a1', paymentId: 'pay', periodId: p1.id, amountMinor: 7_000, atUtc: stamp(), eventId: 'alloc-event-1' }),
      allocatePayment(database, { id: 'a2', paymentId: 'pay', periodId: p2.id, amountMinor: 7_000, atUtc: stamp(), eventId: 'alloc-event-2' }),
    ]);
    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(sqlite.prepare("SELECT SUM(amount_minor) AS total FROM payment_allocations WHERE payment_id='pay';").get().total, 7_000);
    const survivingPeriod = sqlite.prepare("SELECT period_id FROM payment_allocations WHERE payment_id='pay';").get().period_id;
    const survivingId = sqlite.prepare("SELECT id FROM payment_allocations WHERE payment_id='pay';").get().id;
    await assert.rejects(allocatePayment(database, { id: 'rollback-allocation', paymentId: 'pay', periodId: survivingPeriod === p1.id ? p2.id : p1.id, amountMinor: 1_000, atUtc: stamp(), eventId: 'payment-event' }));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_allocations WHERE payment_id='pay';").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_ledger_events WHERE entity_id='rollback-allocation';").get().count, 0);
    assert.ok(survivingId);
  } finally { sqlite.close(); }
});

test('payment, allocations and payslip history survive SQLite close and reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vardiyam-payments-'));
  const path = join(directory, 'synthetic.db');
  try {
    let { sqlite, database } = setup(path);
    await initializeDatabase(database);
    const p = await getOrCreatePayrollPeriod(database, period('p', '2026-01-01', '2026-02-01'));
    await savePayslipNet(database, { periodId: p.id, amountMinor: 3_500_000, note: null, atUtc: stamp(), eventId: 'e1' });
    await createNetPayment(database, { id: 'pay', paymentLocalDate: '2026-02-02', amountMinor: 3_000_000, method: 'BANK', description: null, atUtc: stamp(), eventId: 'e2' });
    await allocatePayment(database, { id: 'a', paymentId: 'pay', periodId: p.id, amountMinor: 3_000_000, atUtc: stamp(), eventId: 'e3' });
    sqlite.close();
    ({ sqlite, database } = setup(path));
    await initializeDatabase(database);
    const ledger = await getPeriodPaymentLedger(database, 'p');
    assert.equal(ledger.statement?.amountMinor, 3_500_000);
    assert.equal(ledger.reconciliation.allocatedPaymentMinor, 3_000_000);
    assert.equal(ledger.reconciliation.differenceMinor, 500_000);
    assert.equal(sqlite.prepare('PRAGMA user_version;').get().user_version, 9);
    sqlite.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
