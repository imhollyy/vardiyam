import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPayPeriod,
  enumerateDays,
  deriveDays,
  calculateOvertime,
  calculateHolidayBonus,
  calculateDeductions,
  calculateExtraIncome,
  isExtraIncomeInPeriod,
  calculateBes,
  calculateIncomeTax,
  calculateAnnualLeave,
  calculateSeverance,
  generateMonthlyStatement,
} from '../../src/domain/payroll/index.ts';

const MONTHLY = 2250000;
const HOURLY = Math.round(MONTHLY / 225);
const DAILY = Math.round(MONTHLY / 30);

const BASE_SETTINGS = {
  salaryMinor: MONTHLY,
  salaryType: 'GROSS',
  payday: '1',
  besEnabled: false,
  besRateBp: 300,
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  startDate: '2025-01-01',
  setupCompleted: true,
};

function makeDayEntry(localDate, overrides = {}) {
  return {
    localDate,
    shiftOverrideId: null,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    leaveType: null,
    leaveHalfDay: false,
    leaveHours: 0,
    deductOverride: null,
    note: null,
    ...overrides,
  };
}

function makeLeaveDay(localDate, leaveType, overrides = {}) {
  return [{
    localDate,
    status: 'LEAVE',
    leaveType,
    leaveHalfDay: overrides.leaveHalfDay ?? false,
    leaveHours: overrides.leaveHours ?? 0,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    isHoliday: false,
    isWeekend: false,
    shiftTemplateId: null,
    note: null,
  }];
}

function makeIncome(frequency, firstPaymentDate, overrides = {}) {
  return {
    id: '1',
    type: 'BONUS',
    customName: null,
    amountMinor: 50000,
    frequency,
    firstPaymentDate,
    createdAt: '',
    ...overrides,
  };
}

// --- Pay period ---

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
  const { end } = getPayPeriod(2025, 2, 'LAST');
  assert.equal(end, '2025-02-28');
});

test('getPayPeriod: payday 31, February clamps to 28', () => {
  const { end } = getPayPeriod(2025, 2, '31');
  assert.equal(end, '2025-02-28');
});

test('getPayPeriod: payday 31, January keeps 31', () => {
  const { end } = getPayPeriod(2025, 1, '31');
  assert.equal(end, '2025-01-31');
});

test('getPayPeriod: payday LAST, January vs February differ', () => {
  const jan = getPayPeriod(2025, 1, 'LAST');
  const feb = getPayPeriod(2025, 2, 'LAST');
  assert.equal(jan.end, '2025-01-31');
  assert.equal(feb.end, '2025-02-28');
});

// --- enumerateDays ---

test('enumerateDays: counts correctly', () => {
  const days = enumerateDays('2025-01-01', '2025-01-05');
  assert.equal(days.length, 5);
  assert.equal(days[0], '2025-01-01');
  assert.equal(days[4], '2025-01-05');
});

// --- deriveDays ---

test('deriveDays: marks weekends as OFF for MON_FRI', () => {
  const dates = enumerateDays('2025-01-06', '2025-01-12');
  const days = deriveDays(dates, new Map(), BASE_SETTINGS);
  const statuses = days.map((d) => d.status);
  assert.deepEqual(statuses, ['WORKED', 'WORKED', 'WORKED', 'WORKED', 'WORKED', 'OFF', 'OFF']);
});

test('deriveDays: marks holiday as HOLIDAY', () => {
  const days = deriveDays(['2025-01-01'], new Map(), BASE_SETTINGS);
  assert.equal(days[0].status, 'HOLIDAY');
  assert.equal(days[0].isHoliday, true);
});

test('deriveDays: leave entry overrides status', () => {
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'ANNUAL' })]]);
  const days = deriveDays(['2025-01-06'], entries, BASE_SETTINGS);
  assert.equal(days[0].status, 'LEAVE');
  assert.equal(days[0].leaveType, 'ANNUAL');
});

test('deriveDays: EVERY_DAY schedule has no OFF days', () => {
  const dates = enumerateDays('2025-01-06', '2025-01-12');
  const days = deriveDays(dates, new Map(), { ...BASE_SETTINGS, workSchedule: 'EVERY_DAY' });
  assert.ok(days.every((d) => d.status === 'WORKED'));
});

// --- Overtime ---

test('calculateOvertime: 120 min at monthly salary', () => {
  const result = calculateOvertime(120, MONTHLY);
  const expected = Math.round(Math.round(HOURLY * 2) * 15000 / 10000);
  assert.equal(result, expected);
  assert.ok(result > 0);
});

test('calculateOvertime: 0 minutes returns 0', () => {
  assert.equal(calculateOvertime(0, MONTHLY), 0);
});

// --- Holiday bonus ---

test('calculateHolidayBonus: 1 day', () => {
  const result = calculateHolidayBonus(1, DAILY);
  assert.equal(result, Math.round(DAILY * 20000 / 10000));
});

// --- Leave type deductions (§1.1 table) ---

test('ANNUAL leave: not deducted by default', () => {
  const days = makeLeaveDay('2025-01-06', 'ANNUAL');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'ANNUAL' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

test('UNPAID leave: deducted full day', () => {
  const days = makeLeaveDay('2025-01-06', 'UNPAID');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'UNPAID' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), DAILY);
});

test('SICK leave: not deducted by default (SGK pays)', () => {
  const days = makeLeaveDay('2025-01-06', 'SICK');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'SICK' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

test('EXCUSE leave: deducted full day', () => {
  const days = makeLeaveDay('2025-01-06', 'EXCUSE');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'EXCUSE' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), DAILY);
});

test('MATERNITY leave: not deducted', () => {
  const days = makeLeaveDay('2025-01-06', 'MATERNITY');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'MATERNITY' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

test('BEREAVEMENT leave: not deducted', () => {
  const days = makeLeaveDay('2025-01-06', 'BEREAVEMENT');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'BEREAVEMENT' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

test('SOCIAL leave: not deducted', () => {
  const days = makeLeaveDay('2025-01-06', 'SOCIAL');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'SOCIAL' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

test('HOURLY leave: deducted by hours', () => {
  const days = makeLeaveDay('2025-01-06', 'HOURLY', { leaveHours: 3 });
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'HOURLY', leaveHours: 3 })]]);
  const expected = Math.round(HOURLY * 3);
  assert.equal(calculateDeductions(days, entries, MONTHLY), expected);
});

test('HOLIDAY: not deducted', () => {
  const days = makeLeaveDay('2025-01-06', 'HOLIDAY');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'HOLIDAY' })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

// --- deductOverride ---

test('deductOverride true forces deduction on non-deducting type (ANNUAL)', () => {
  const days = makeLeaveDay('2025-01-06', 'ANNUAL');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'ANNUAL', deductOverride: true })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), DAILY);
});

test('deductOverride false prevents deduction on deducting type (UNPAID)', () => {
  const days = makeLeaveDay('2025-01-06', 'UNPAID');
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'UNPAID', deductOverride: false })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), 0);
});

// --- Half day ---

test('half-day deduction is half the daily salary', () => {
  const days = makeLeaveDay('2025-01-06', 'EXCUSE', { leaveHalfDay: true });
  const entries = new Map([['2025-01-06', makeDayEntry('2025-01-06', { leaveType: 'EXCUSE', leaveHalfDay: true })]]);
  assert.equal(calculateDeductions(days, entries, MONTHLY), Math.round(DAILY / 2));
});

// --- Extra income (5 frequencies + period boundaries) ---

test('MONTHLY extra income always applies', () => {
  const income = makeIncome('MONTHLY', null);
  assert.equal(isExtraIncomeInPeriod(income, '2025-02-16', '2025-03-15'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-06-01', '2025-06-30'), true);
});

test('ONCE extra income only in its period', () => {
  const income = makeIncome('ONCE', '2025-03-01');
  assert.equal(isExtraIncomeInPeriod(income, '2025-02-16', '2025-03-15'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-03-16', '2025-04-15'), false);
  assert.equal(isExtraIncomeInPeriod(income, '2025-01-16', '2025-02-15'), false);
});

test('QUARTERLY extra income every 3 months from start', () => {
  const income = makeIncome('QUARTERLY', '2025-01-15');
  assert.equal(isExtraIncomeInPeriod(income, '2025-01-01', '2025-01-31'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-02-01', '2025-02-28'), false);
  assert.equal(isExtraIncomeInPeriod(income, '2025-04-01', '2025-04-30'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-07-01', '2025-07-31'), true);
});

test('BIANNUAL extra income every 6 months', () => {
  const income = makeIncome('BIANNUAL', '2025-03-10');
  assert.equal(isExtraIncomeInPeriod(income, '2025-03-01', '2025-03-31'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-06-01', '2025-06-30'), false);
  assert.equal(isExtraIncomeInPeriod(income, '2025-09-01', '2025-09-30'), true);
});

test('ANNUAL extra income once per year', () => {
  const income = makeIncome('ANNUAL', '2025-06-15');
  assert.equal(isExtraIncomeInPeriod(income, '2025-06-01', '2025-06-30'), true);
  assert.equal(isExtraIncomeInPeriod(income, '2025-07-01', '2025-07-31'), false);
  assert.equal(isExtraIncomeInPeriod(income, '2026-06-01', '2026-06-30'), true);
});

test('calculateExtraIncome: sums applicable incomes in period', () => {
  const incomes = [
    makeIncome('MONTHLY', null, { id: '1', amountMinor: 30000 }),
    makeIncome('ONCE', '2025-06-01', { id: '2', amountMinor: 100000 }),
  ];
  assert.equal(calculateExtraIncome(incomes, '2025-02-16', '2025-03-15'), 30000);
  assert.equal(calculateExtraIncome(incomes, '2025-05-16', '2025-06-15'), 130000);
});

// --- BES ---

test('BES gross mode: based on base salary', () => {
  const result = calculateBes(2000000, 300, 'GROSS');
  assert.equal(result, Math.round(2000000 * 300 / 10000));
});

test('BES net mode: uses approximate gross', () => {
  const result = calculateBes(2000000, 300, 'NET');
  const approxGross = Math.round(2000000 * 10000 / 6500);
  const expected = Math.round(approxGross * 300 / 10000);
  assert.equal(result, expected);
  assert.ok(result > calculateBes(2000000, 300, 'GROSS'));
});

// --- Income tax ---

test('calculateIncomeTax: first bracket only', () => {
  const taxable = 1000000;
  const result = calculateIncomeTax(taxable, 0, 2025);
  assert.equal(result, Math.round(taxable * 1500 / 10000));
});

test('calculateIncomeTax: spans two brackets', () => {
  const taxable = 20000000;
  const result = calculateIncomeTax(taxable, 0, 2025);
  const firstBracket = Math.round(15800000 * 1500 / 10000);
  const secondBracket = Math.round(4200000 * 2000 / 10000);
  assert.equal(result, firstBracket + secondBracket);
});

test('calculateIncomeTax: unknown year falls back to 2025', () => {
  const taxable = 1000000;
  const result2030 = calculateIncomeTax(taxable, 0, 2030);
  const result2025 = calculateIncomeTax(taxable, 0, 2025);
  assert.equal(result2030, result2025);
});

// --- NET mode ---

test('generateMonthlyStatement: NET mode has zero tax and SGK', () => {
  const settings = { ...BASE_SETTINGS, salaryType: 'NET', payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.equal(stmt.sgkWorkerMinor, 0);
  assert.equal(stmt.unemploymentWorkerMinor, 0);
  assert.equal(stmt.incomeTaxMinor, 0);
  assert.equal(stmt.stampTaxMinor, 0);
  assert.equal(stmt.salaryType, 'NET');
  assert.equal(stmt.netMinor, stmt.grossMinor);
});

test('generateMonthlyStatement: GROSS mode applies tax and SGK', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.ok(stmt.sgkWorkerMinor > 0);
  assert.ok(stmt.incomeTaxMinor > 0);
  assert.ok(stmt.stampTaxMinor > 0);
  assert.ok(stmt.netMinor < stmt.grossMinor);
});

// --- EVERY_DAY scheduled overtime (haftalık limit bazlı) ---

test('EVERY_DAY: giriş ve şablon olmadan otomatik mesai YOK (haftalık limit bazlı)', () => {
  // Yeni davranış: şablon/giriş olmadan scheduled overtime hesaplanamaz.
  // calculateScheduledOvertime şablona ihtiyaç duyar; günlük standart tabanlı eski mantık kaldırıldı.
  const settings = { ...BASE_SETTINGS, workSchedule: 'EVERY_DAY', payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 8);
  assert.equal(stmt.scheduledOvertimeMinutes, 0);
  assert.equal(stmt.overtimeMinutes, 0);
});

test('MON_FRI: no automatic Sunday overtime', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.equal(stmt.overtimeMinutes, 0);
  assert.equal(stmt.overtimeMinor, 0);
});

// --- BES in statement ---

test('generateMonthlyStatement: BES enabled deducts from result', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST', besEnabled: true, besRateBp: 300 };
  const stmtNoBes = generateMonthlyStatement({ ...settings, besEnabled: false }, new Map(), [], 2025, 3);
  const stmtBes = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.ok(stmtBes.besDeductionMinor > 0);
  assert.ok(stmtBes.netMinor < stmtNoBes.netMinor);
});

// --- Annual leave ---

test('calculateAnnualLeave: less than 1 year → 0 earned', () => {
  const result = calculateAnnualLeave('2025-06-01', '2026-05-31', 0);
  assert.equal(result.earnedDays, 0);
});

test('calculateAnnualLeave: exactly 1 year → 14 days', () => {
  const result = calculateAnnualLeave('2024-01-01', '2025-01-01', 2);
  assert.equal(result.earnedDays, 14);
  assert.equal(result.usedDays, 2);
  assert.equal(result.remainingDays, 12);
});

test('calculateAnnualLeave: 4 years → 14 days (1–5 tier)', () => {
  const result = calculateAnnualLeave('2021-01-01', '2025-01-01', 0);
  assert.equal(result.earnedDays, 14);
});

test('calculateAnnualLeave: exactly 5 years → 20 days (5–15 tier)', () => {
  const result = calculateAnnualLeave('2020-01-01', '2025-01-01', 0);
  assert.equal(result.earnedDays, 20);
});

test('calculateAnnualLeave: 14 years → 20 days', () => {
  const result = calculateAnnualLeave('2011-01-01', '2025-01-01', 0);
  assert.equal(result.earnedDays, 20);
});

test('calculateAnnualLeave: exactly 15 years → 26 days', () => {
  const result = calculateAnnualLeave('2010-01-01', '2025-01-01', 0);
  assert.equal(result.earnedDays, 26);
});

test('calculateAnnualLeave: half-day usage counted as 0.5', () => {
  const result = calculateAnnualLeave('2024-01-01', '2025-01-01', 0.5);
  assert.equal(result.remainingDays, 13.5);
});

// --- Severance ---

test('calculateSeverance: less than 1 year → 0', () => {
  assert.equal(calculateSeverance('2025-06-01', '2026-05-31', MONTHLY), 0);
});

test('calculateSeverance: 3 full years, under ceiling', () => {
  const result = calculateSeverance('2022-01-01', '2025-06-01', MONTHLY);
  assert.equal(result, MONTHLY * 3);
});

test('calculateSeverance: ceiling caps per-year amount', () => {
  const highSalary = 5000000;
  const result = calculateSeverance('2022-01-01', '2025-06-01', highSalary);
  assert.equal(result, 2384437 * 3);
});

// --- Money integer check ---

test('money is always integer (kuruş)', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST', salaryMinor: 2250001 };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.ok(Number.isInteger(stmt.grossMinor));
  assert.ok(Number.isInteger(stmt.netMinor));
  assert.ok(Number.isInteger(stmt.sgkWorkerMinor));
  assert.ok(Number.isInteger(stmt.incomeTaxMinor));
  assert.ok(Number.isInteger(stmt.stampTaxMinor));
  assert.ok(Number.isInteger(stmt.overtimeMinor));
  assert.ok(Number.isInteger(stmt.besDeductionMinor));
});

// --- Basic statement ---

test('generateMonthlyStatement: basic month with no entries', () => {
  const settings = { ...BASE_SETTINGS, payday: 'LAST' };
  const stmt = generateMonthlyStatement(settings, new Map(), [], 2025, 3);
  assert.equal(stmt.baseSalaryMinor, MONTHLY);
  assert.ok(stmt.workedDays > 0);
  assert.ok(stmt.grossMinor > 0);
  assert.ok(stmt.netMinor > 0);
  assert.ok(stmt.netMinor < stmt.grossMinor);
  assert.equal(stmt.besDeductionMinor, 0);
  assert.equal(stmt.salaryType, 'GROSS');
});

// --- Overtime single-counting ---

test('EVERY_DAY: elle girilen mesai (60 dk) doğru yansır, günlük standart mesai eklenmez', () => {
  // Yeni davranış: sadece manuel overtimeMinutes ve calculateScheduledOvertime sonucu toplanır.
  // Şablon verilmediğinden scheduledOvertimeMinutes=0; sadece manualOvertimeMinutes=60.
  const settings = { ...BASE_SETTINGS, workSchedule: 'EVERY_DAY', payday: 'LAST' };
  const sunday = '2025-08-03';
  assert.equal(new Date(2025, 7, 3).getDay(), 0);
  const entries = new Map([[sunday, makeDayEntry(sunday, { overtimeMinutes: 60 })]]);
  const stmt = generateMonthlyStatement(settings, entries, [], 2025, 8);
  assert.equal(stmt.manualOvertimeMinutes, 60);
  assert.equal(stmt.scheduledOvertimeMinutes, 0);
  assert.equal(stmt.overtimeMinutes, 60);
});
