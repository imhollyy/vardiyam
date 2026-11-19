import {
  OVERTIME_MULTIPLIER_BP,
  HOLIDAY_MULTIPLIER_BP,
  WEEKEND_MULTIPLIER_BP,
  DAILY_STANDARD_MINUTES,
  SGK_WORKER_RATE_BP,
  UNEMPLOYMENT_WORKER_RATE_BP,
  STAMP_TAX_RATE_BP,
  INCOME_TAX_BRACKETS_2025,
  LEAVE_TYPES,
} from '../../config/payroll.ts';
import { isOfficialHoliday } from '../../config/holidays.ts';
import type {
  Settings,
  DayEntry,
  ExtraIncome,
  DerivedDay,
  DayStatus,
  MonthlyStatement,
  LeaveType,
  ExtraIncomeFrequency,
} from './types.ts';

export type { Settings, DayEntry, ExtraIncome, DerivedDay, DayStatus, MonthlyStatement, LeaveType, ExtraIncomeFrequency };

function dayOfWeek(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

function isWeekendDay(localDate: string, workSchedule: Settings['workSchedule']): boolean {
  const dow = dayOfWeek(localDate);
  if (workSchedule === 'EVERY_DAY') return false;
  if (dow === 0) return true;
  if (workSchedule === 'MON_FRI' && dow === 6) return true;
  return false;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getPayPeriod(year: number, month: number, payday: string): { start: string; end: string } {
  const pd = payday === 'LAST' ? daysInMonth(year, month) : Math.min(Number(payday), daysInMonth(year, month));
  const pad = (n: number) => String(n).padStart(2, '0');

  const endDate = `${year}-${pad(month)}-${pad(pd)}`;

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  const prevPd = payday === 'LAST'
    ? daysInMonth(prevYear, prevMonth)
    : Math.min(Number(payday), daysInMonth(prevYear, prevMonth));
  const startDay = prevPd + 1;
  let startMonth = prevMonth;
  let startYear = prevYear;
  if (startDay > daysInMonth(prevYear, prevMonth)) {
    startMonth = prevMonth + 1;
    if (startMonth > 12) { startMonth = 1; startYear++; }
  }
  const actualStartDay = startDay > daysInMonth(prevYear, prevMonth) ? 1 : startDay;
  const startDate = `${startYear}-${pad(startMonth)}-${pad(actualStartDay)}`;

  return { start: startDate, end: endDate };
}

export function enumerateDays(start: string, end: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number) as [number, number, number];
  const [ey, em, ed] = end.split('-').map(Number) as [number, number, number];
  const current = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (current <= last) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function deriveDays(
  periodDates: string[],
  dayEntries: Map<string, DayEntry>,
  settings: Settings,
): DerivedDay[] {
  return periodDates.map((localDate) => {
    const entry = dayEntries.get(localDate);
    const holiday = isOfficialHoliday(localDate);
    const weekend = isWeekendDay(localDate, settings.workSchedule);

    let status: DayStatus;
    let leaveType: LeaveType | null = null;
    let leaveHalfDay = false;
    let leaveHours = 0;

    if (entry?.leaveType) {
      status = 'LEAVE';
      leaveType = entry.leaveType;
      leaveHalfDay = entry.leaveHalfDay;
      leaveHours = entry.leaveHours;
    } else if (holiday) {
      status = 'HOLIDAY';
      leaveType = 'HOLIDAY';
    } else if (weekend) {
      status = 'OFF';
    } else {
      status = 'WORKED';
    }

    return {
      localDate,
      status,
      leaveType,
      leaveHalfDay,
      leaveHours,
      overtimeMinutes: entry?.overtimeMinutes ?? 0,
      lateEarlyMinutes: entry?.lateEarlyMinutes ?? 0,
      isHoliday: holiday,
      isWeekend: weekend,
      shiftTemplateId: entry?.shiftOverrideId ?? null,
      note: entry?.note ?? null,
    };
  });
}

function applyBp(amount: number, rateBp: number): number {
  return Math.round(amount * rateBp / 10000);
}

export function calculateOvertime(totalOvertimeMinutes: number, dailySalaryMinor: number): number {
  const hourlyRate = Math.round(dailySalaryMinor / (DAILY_STANDARD_MINUTES / 60));
  const hours = totalOvertimeMinutes / 60;
  return applyBp(Math.round(hourlyRate * hours), OVERTIME_MULTIPLIER_BP);
}

export function calculateHolidayBonus(holidayWorkedDays: number, dailySalaryMinor: number): number {
  return applyBp(dailySalaryMinor * holidayWorkedDays, HOLIDAY_MULTIPLIER_BP);
}

export function calculateWeekendBonus(weekendWorkedDays: number, dailySalaryMinor: number): number {
  return applyBp(dailySalaryMinor * weekendWorkedDays, WEEKEND_MULTIPLIER_BP);
}

function isLeaveDeducted(leaveType: LeaveType, deductOverride: boolean | null): boolean {
  if (deductOverride !== null) return deductOverride;
  const config = LEAVE_TYPES.find((lt) => lt.code === leaveType);
  return config?.deductFromSalary ?? false;
}

export function calculateDeductions(days: DerivedDay[], dayEntries: Map<string, DayEntry>, dailySalaryMinor: number): number {
  let totalMinor = 0;
  for (const day of days) {
    if (day.status !== 'LEAVE' || !day.leaveType) continue;
    const entry = dayEntries.get(day.localDate);
    const deduct = isLeaveDeducted(day.leaveType, entry?.deductOverride ?? null);
    if (!deduct) continue;

    if (day.leaveType === 'HOURLY') {
      const hourlyRate = Math.round(dailySalaryMinor / (DAILY_STANDARD_MINUTES / 60));
      totalMinor += Math.round(hourlyRate * day.leaveHours);
    } else if (day.leaveHalfDay) {
      totalMinor += Math.round(dailySalaryMinor / 2);
    } else {
      totalMinor += dailySalaryMinor;
    }
  }
  const lateEarlyMinutes = days.reduce((sum, d) => sum + d.lateEarlyMinutes, 0);
  if (lateEarlyMinutes > 0) {
    const minuteRate = Math.round(dailySalaryMinor / DAILY_STANDARD_MINUTES);
    totalMinor += minuteRate * lateEarlyMinutes;
  }
  return totalMinor;
}

export function isExtraIncomeInPeriod(
  income: ExtraIncome,
  periodYear: number,
  periodMonth: number,
): boolean {
  if (!income.firstPaymentDate) return income.frequency === 'MONTHLY';
  const [fy, fm] = income.firstPaymentDate.split('-').map(Number) as [number, number];
  if (periodYear < fy || (periodYear === fy && periodMonth < fm)) return false;

  const monthsDiff = (periodYear - fy) * 12 + (periodMonth - fm);
  switch (income.frequency) {
    case 'MONTHLY': return true;
    case 'ONCE': return monthsDiff === 0;
    case 'QUARTERLY': return monthsDiff % 3 === 0;
    case 'BIANNUAL': return monthsDiff % 6 === 0;
    case 'ANNUAL': return monthsDiff % 12 === 0;
  }
}

export function calculateExtraIncome(incomes: ExtraIncome[], periodYear: number, periodMonth: number): number {
  return incomes
    .filter((i) => isExtraIncomeInPeriod(i, periodYear, periodMonth))
    .reduce((sum, i) => sum + i.amountMinor, 0);
}

export function calculateBes(grossMinor: number, besRateBp: number): number {
  return applyBp(grossMinor, besRateBp);
}

export function calculateIncomeTax(taxableMinor: number, cumulativeTaxableMinor: number): number {
  let remaining = taxableMinor;
  let cumulative = cumulativeTaxableMinor;
  let tax = 0;

  for (const bracket of INCOME_TAX_BRACKETS_2025) {
    if (remaining <= 0) break;
    const spaceInBracket = Math.max(0, bracket.upperLimitMinor - cumulative);
    const taxable = Math.min(remaining, spaceInBracket);
    tax += applyBp(taxable, bracket.rateBp);
    remaining -= taxable;
    cumulative += taxable;
  }

  return tax;
}

export function generateMonthlyStatement(
  settings: Settings,
  dayEntries: Map<string, DayEntry>,
  extraIncomes: ExtraIncome[],
  year: number,
  month: number,
  cumulativeTaxableMinor: number = 0,
): MonthlyStatement {
  const { start, end } = getPayPeriod(year, month, settings.payday);
  const periodDates = enumerateDays(start, end);
  const days = deriveDays(periodDates, dayEntries, settings);

  const totalDays = periodDates.length;
  const workedDays = days.filter((d) => d.status === 'WORKED').length;
  const dailySalaryMinor = Math.round(settings.salaryMinor / 30);

  const totalOvertimeMinutes = days.reduce((s, d) => s + d.overtimeMinutes, 0);
  const overtimeMinor = calculateOvertime(totalOvertimeMinutes, dailySalaryMinor);

  const holidayWorkedDays = days.filter((d) => d.isHoliday && d.status === 'WORKED').length;
  const holidayBonusMinor = calculateHolidayBonus(holidayWorkedDays, dailySalaryMinor);

  const weekendWorkedDays = days.filter((d) => d.isWeekend && d.overtimeMinutes > 0).length;
  const weekendBonusMinor = calculateWeekendBonus(weekendWorkedDays, dailySalaryMinor);

  const deductionMinor = calculateDeductions(days, dayEntries, dailySalaryMinor);
  const extraIncomeMinor = calculateExtraIncome(extraIncomes, year, month);

  const grossMinor = settings.salaryMinor + overtimeMinor + holidayBonusMinor + weekendBonusMinor - deductionMinor + extraIncomeMinor;

  const besDeductionMinor = settings.besEnabled ? calculateBes(grossMinor, settings.besRateBp) : 0;

  const sgkWorkerMinor = applyBp(grossMinor, SGK_WORKER_RATE_BP);
  const unemploymentWorkerMinor = applyBp(grossMinor, UNEMPLOYMENT_WORKER_RATE_BP);
  const taxableMinor = grossMinor - sgkWorkerMinor - unemploymentWorkerMinor;
  const incomeTaxMinor = calculateIncomeTax(taxableMinor, cumulativeTaxableMinor);
  const stampTaxMinor = applyBp(grossMinor, STAMP_TAX_RATE_BP);

  const netMinor = grossMinor - sgkWorkerMinor - unemploymentWorkerMinor - incomeTaxMinor - stampTaxMinor - besDeductionMinor;

  return {
    periodStart: start,
    periodEnd: end,
    baseSalaryMinor: settings.salaryMinor,
    workedDays,
    totalDays,
    overtimeMinor,
    holidayBonusMinor,
    weekendBonusMinor,
    deductionMinor,
    extraIncomeMinor,
    besDeductionMinor,
    grossMinor,
    sgkWorkerMinor,
    unemploymentWorkerMinor,
    stampTaxMinor,
    incomeTaxMinor,
    netMinor,
  };
}
