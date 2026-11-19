import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPayPeriod,
  enumerateDays,
  deriveDays,
  calculateOvertime,
  calculateHolidayBonus,
  calculateWeekendBonus,
  calculateDeductions,
  calculateExtraIncome,
  isExtraIncomeInPeriod,
  calculateBes,
  calculateIncomeTax,
  generateMonthlyStatement,
} from '../../src/domain/payroll/index.ts';

const BASE_SETTINGS = {
  salaryMinor: 2250000,
  salaryType: 'GROSS',
  payday: '1',
  besEnabled: false,
  besRateBp: 300,
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  startDate: '2025-01-01',
  setupCompleted: true,
};

test('getPayPeriod: payday 1, January 2025', () => {
  const { start, end } = getPayPeriod(2025, 1, '1');
  assert.equal(end, '2025-01-01');
  assert.equal(start, '2024-12-02');
});

test('getPayPeriod: payday 15, March 2025', () => {
  const { start, end } = getPayPeriod(2025, 3, '15');
  assert.equal(start, '2025-02-16');
  assert.equal(end, '2025-03-15');
});

test('getPayPeriod: payday LAST, February 2025', () => {
  const { start, end } = getPayPeriod(2025, 2, 'LAST');
  assert.equal(end, '2025-02-28');
});

test('enumerateDays: counts correctly', () => {
  const days = enumerateDays('2025-01-01', '2025-01-05');
  assert.equal(days.length, 5);
  assert.equal(days[0], '2025-01-01');
  assert.equal(days[4], '2025-01-05');
});

test('deriveDays: marks weekends as OFF for MON_FRI', () => {
  const dates = enumerateDays('2025-01-06', '2025-01-12');
  const days = deriveDays(dates, new Map(), BASE_SETTINGS);
  const statuses = days.map((d) => d.status);
  assert.deepEqual(statuses, ['WORKED', 'WORKED', 'WORKED', 'WORKED', 'WORKED', 'OFF', 'OFF']);
});

test('deriveDays: marks holiday as HOLIDAY', () => {
  const dates = ['2025-01-01'];
  const days = deriveDays(dates, new Map(), BASE_SETTINGS);
  assert.equal(days[0].status, 'HOLIDAY');
  assert.equal(days[0].isHoliday, true);
});

test('deriveDays: leave entry overrides status', () => {
  const dates = ['2025-01-06'];
  const entries = new Map([['2025-01-06', {
    localDate: '2025-01-06',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: 'ANNUAL',
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  }]]);
  const days = deriveDays(dates, entries, BASE_SETTINGS);
  assert.equal(days[0].status, 'LEAVE');
  assert.equal(days[0].leaveType, 'ANNUAL');
});

test('calculateOvertime: 120 min at 75000/day', () => {
  const dailySalary = 75000;
  const result = calculateOvertime(120, dailySalary);
  assert.ok(result > 0);
  const hourlyRate = Math.round(dailySalary / 7.5);
  const expected = Math.round(Math.round(hourlyRate * 2) * 15000 / 10000);
  assert.equal(result, expected);
});

test('calculateHolidayBonus: 1 day at 75000/day', () => {
  const result = calculateHolidayBonus(1, 75000);
  assert.equal(result, Math.round(75000 * 20000 / 10000));
});

test('calculateWeekendBonus: 2 days at 75000/day', () => {
  const result = calculateWeekendBonus(2, 75000);
  assert.equal(result, Math.round(150000 * 20000 / 10000));
});

test('calculateDeductions: unpaid leave deducts full day', () => {
  const days = [{
    localDate: '2025-01-06',
    status: 'LEAVE',
    leaveType: 'UNPAID',
    leaveHalfDay: false,
    leaveHours: 0,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    isHoliday: false,
    isWeekend: false,
    shiftTemplateId: null,
    note: null,
  }];
  const entries = new Map([['2025-01-06', {
    localDate: '2025-01-06',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: 'UNPAID',
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  }]]);
  const result = calculateDeductions(days, entries, 75000);
  assert.equal(result, 75000);
});

test('calculateDeductions: half-day sick leave deducts half', () => {
  const days = [{
    localDate: '2025-01-06',
    status: 'LEAVE',
    leaveType: 'SICK',
    leaveHalfDay: true,
    leaveHours: 0,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    isHoliday: false,
    isWeekend: false,
    shiftTemplateId: null,
    note: null,
  }];
  const entries = new Map([['2025-01-06', {
    localDate: '2025-01-06',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: 'SICK',
    leaveHalfDay: true,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  }]]);
  const result = calculateDeductions(days, entries, 75000);
  assert.equal(result, Math.round(75000 / 2));
});

test('calculateDeductions: annual leave is NOT deducted', () => {
  const days = [{
    localDate: '2025-01-06',
    status: 'LEAVE',
    leaveType: 'ANNUAL',
    leaveHalfDay: false,
    leaveHours: 0,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    isHoliday: false,
    isWeekend: false,
    shiftTemplateId: null,
    note: null,
  }];
  const entries = new Map([['2025-01-06', {
    localDate: '2025-01-06',
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: 'ANNUAL',
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
  }]]);
  const result = calculateDeductions(days, entries, 75000);
  assert.equal(result, 0);
});

test('isExtraIncomeInPeriod: monthly always true', () => {
  const income = { id: '1', type: 'BONUS', customName: null, amountMinor: 50000, frequency: 'MONTHLY', firstPaymentDate: '2025-01-01', createdAt: '' };
  assert.equal(isExtraIncomeInPeriod(income, 2025, 3), true);
});

test('isExtraIncomeInPeriod: once only in first month', () => {
  const income = { id: '1', type: 'BONUS', customName: null, amountMinor: 50000, frequency: 'ONCE', firstPaymentDate: '2025-03-01', createdAt: '' };
  assert.equal(isExtraIncomeInPeriod(income, 2025, 3), true);
  assert.equal(isExtraIncomeInPeriod(income, 2025, 4), false);
});

test('isExtraIncomeInPeriod: quarterly every 3 months', () => {
  const income = { id: '1', type: 'BONUS', customName: null, amountMinor: 50000, frequency: 'QUARTERLY', firstPaymentDate: '2025-01-01', createdAt: '' };
  assert.equal(isExtraIncomeInPeriod(income, 2025, 1), true);
  assert.equal(isExtraIncomeInPeriod(income, 2025, 2), false);
  assert.equal(isExtraIncomeInPeriod(income, 2025, 4), true);
});

test('calculateExtraIncome: sums applicable incomes', () => {
  const incomes = [
    { id: '1', type: 'TRANSPORT', customName: null, amountMinor: 30000, frequency: 'MONTHLY', firstPaymentDate: '2025-01-01', createdAt: '' },
    { id: '2', type: 'BONUS', customName: null, amountMinor: 100000, frequency: 'ONCE', firstPaymentDate: '2025-06-01', createdAt: '' },
  ];
  assert.equal(calculateExtraIncome(incomes, 2025, 3), 30000);
  assert.equal(calculateExtraIncome(incomes, 2025, 6), 130000);
});

test('calculateBes: 3% of gross', () => {
  const result = calculateBes(2000000, 300);
  assert.equal(result, Math.round(2000000 * 300 / 10000));
});

test('calculateIncomeTax: first bracket only', () => {
  const taxable = 1000000;
  const result = calculateIncomeTax(taxable, 0);
  assert.equal(result, Math.round(taxable * 1500 / 10000));
});

test('calculateIncomeTax: spans two brackets', () => {
  const taxable = 20000000;
  const result = calculateIncomeTax(taxable, 0);
  const firstBracket = Math.round(15800000 * 1500 / 10000);
  const secondBracket = Math.round(4200000 * 2000 / 10000);
  assert.equal(result, firstBracket + secondBracket);
});

test('generateMonthlyStatement: basic month with no entries', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.equal(stmt.baseSalaryMinor, 2250000);
  assert.ok(stmt.workedDays > 0);
  assert.ok(stmt.grossMinor > 0);
  assert.ok(stmt.netMinor > 0);
  assert.ok(stmt.netMinor < stmt.grossMinor);
  assert.equal(stmt.besDeductionMinor, 0);
});

test('generateMonthlyStatement: BES enabled deducts from net', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST', besEnabled: true, besRateBp: 300 };
  const stmtNoBes = generateMonthlyStatement({ ...settings, besEnabled: false }, new Map(), [], 2025, 3);
  const stmtBes = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.ok(stmtBes.besDeductionMinor > 0);
  assert.ok(stmtBes.netMinor < stmtNoBes.netMinor);
});

test('money is always integer (kuruş)', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST', salaryMinor: 2250001 };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.ok(Number.isInteger(stmt.grossMinor));
  assert.ok(Number.isInteger(stmt.netMinor));
  assert.ok(Number.isInteger(stmt.sgkWorkerMinor));
  assert.ok(Number.isInteger(stmt.incomeTaxMinor));
  assert.ok(Number.isInteger(stmt.stampTaxMinor));
});
