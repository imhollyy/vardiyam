import {
  OVERTIME_MULTIPLIER_BP,
  HOLIDAY_MULTIPLIER_BP,
  DAILY_STANDARD_MINUTES,
  HOURLY_RATE_DIVISOR,
  SGK_WORKER_RATE_BP,
  UNEMPLOYMENT_WORKER_RATE_BP,
  STAMP_TAX_RATE_BP,
  LEAVE_TYPES,
  ANNUAL_LEAVE_TIERS,
  SEVERANCE_CEILING_MINOR,
  NET_TO_GROSS_RATIO_BP,
  getIncomeTaxBrackets,
} from '../../config/payroll.ts';
import { DAILY_STANDARD_BY_SCHEDULE, shiftNominalMinutes } from '../../config/shifts.ts';
import { isOfficialHoliday } from '../../config/holidays.ts';
import type { ShiftTemplate } from '../shift-cycle/index.ts';
import type {
  Settings,
  DayEntry,
  ExtraIncome,
  DerivedDay,
  DayStatus,
  MonthlyStatement,
  LeaveType,
  ExtraIncomeFrequency,
  AnnualLeaveResult,
} from './types.ts';

export type { Settings, DayEntry, ExtraIncome, DerivedDay, DayStatus, MonthlyStatement, LeaveType, ExtraIncomeFrequency, AnnualLeaveResult };

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

function yearsBetween(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number) as [number, number, number];
  const [ey, em, ed] = endDate.split('-').map(Number) as [number, number, number];
  let years = ey - sy;
  if (em < sm || (em === sm && ed < sd)) years--;
  return Math.max(0, years);
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
  templates: readonly ShiftTemplate[] = [],
): DerivedDay[] {
  const templateMap = new Map(templates.map((t) => [t.id, t]));

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

    const tplId = entry?.shiftOverrideId ?? null;
    const tpl = tplId ? templateMap.get(tplId) : null;
    const nominalMin = tpl
      ? shiftNominalMinutes(tpl.startLocalTime, tpl.endLocalTime)
      : 0;

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
      shiftTemplateId: tplId,
      shiftNominalMinutes: nominalMin,
      note: entry?.note ?? null,
    };
  });
}

function applyBp(amount: number, rateBp: number): number {
  return Math.round(amount * rateBp / 10000);
}

export function calculateOvertime(totalOvertimeMinutes: number, monthlySalaryMinor: number): number {
  const hourlyRate = Math.round(monthlySalaryMinor / HOURLY_RATE_DIVISOR);
  const hours = totalOvertimeMinutes / 60;
  return applyBp(Math.round(hourlyRate * hours), OVERTIME_MULTIPLIER_BP);
}

export function calculateHolidayBonus(holidayWorkedDays: number, dailySalaryMinor: number): number {
  return applyBp(dailySalaryMinor * holidayWorkedDays, HOLIDAY_MULTIPLIER_BP);
}

function isLeaveDeducted(leaveType: LeaveType, deductOverride: boolean | null): boolean {
  if (deductOverride !== null) return deductOverride;
  const config = LEAVE_TYPES.find((lt) => lt.code === leaveType);
  return config?.deductFromSalary ?? false;
}

export function calculateDeductions(
  days: DerivedDay[],
  dayEntries: Map<string, DayEntry>,
  monthlySalaryMinor: number,
): number {
  const dailySalaryMinor = Math.round(monthlySalaryMinor / 30);
  const hourlyRate = Math.round(monthlySalaryMinor / HOURLY_RATE_DIVISOR);
  let totalMinor = 0;

  for (const day of days) {
    if (day.status !== 'LEAVE' || !day.leaveType) continue;
    const entry = dayEntries.get(day.localDate);
    const deduct = isLeaveDeducted(day.leaveType, entry?.deductOverride ?? null);
    if (!deduct) continue;

    if (day.leaveType === 'HOURLY') {
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
  periodStart: string,
  periodEnd: string,
): boolean {
  if (income.frequency === 'MONTHLY') return true;
  if (!income.firstPaymentDate) return false;

  const fpd = income.firstPaymentDate;
  if (fpd > periodEnd) return false;

  if (income.frequency === 'ONCE') {
    return fpd >= periodStart && fpd <= periodEnd;
  }

  const intervalMonths = income.frequency === 'QUARTERLY' ? 3
    : income.frequency === 'BIANNUAL' ? 6
    : 12;

  const [fy, fm, fd] = fpd.split('-').map(Number) as [number, number, number];
  let cy = fy;
  let cm = fm;

  while (true) {
    const maxDay = daysInMonth(cy, cm);
    const cd = Math.min(fd, maxDay);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${cy}-${pad(cm)}-${pad(cd)}`;
    if (dateStr > periodEnd) break;
    if (dateStr >= periodStart) return true;
    cm += intervalMonths;
    while (cm > 12) { cm -= 12; cy++; }
  }

  return false;
}

export function calculateExtraIncome(
  incomes: ExtraIncome[],
  periodStart: string,
  periodEnd: string,
): number {
  return incomes
    .filter((i) => isExtraIncomeInPeriod(i, periodStart, periodEnd))
    .reduce((sum, i) => sum + i.amountMinor, 0);
}

export function calculateBes(
  baseSalaryMinor: number,
  besRateBp: number,
  salaryType: Settings['salaryType'],
): number {
  if (salaryType === 'NET') {
    const approximateGross = Math.round(baseSalaryMinor * 10000 / NET_TO_GROSS_RATIO_BP);
    return applyBp(approximateGross, besRateBp);
  }
  return applyBp(baseSalaryMinor, besRateBp);
}

export function calculateIncomeTax(
  taxableMinor: number,
  cumulativeTaxableMinor: number,
  year: number,
): number {
  let remaining = taxableMinor;
  let cumulative = cumulativeTaxableMinor;
  let tax = 0;
  const brackets = getIncomeTaxBrackets(year);

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const spaceInBracket = Math.max(0, bracket.upperLimitMinor - cumulative);
    const taxable = Math.min(remaining, spaceInBracket);
    tax += applyBp(taxable, bracket.rateBp);
    remaining -= taxable;
    cumulative += taxable;
  }

  return tax;
}

export function calculateAnnualLeave(
  startDate: string,
  today: string,
  usedAnnualLeaveDays: number,
): AnnualLeaveResult {
  const years = yearsBetween(startDate, today);
  if (years < 1) {
    return { earnedDays: 0, usedDays: usedAnnualLeaveDays, remainingDays: -usedAnnualLeaveDays };
  }
  const tier = ANNUAL_LEAVE_TIERS.find(
    (t) => years >= t.minYears && (t.maxYears === null || years < t.maxYears),
  );
  const earnedDays = tier?.days ?? 0;
  return { earnedDays, usedDays: usedAnnualLeaveDays, remainingDays: earnedDays - usedAnnualLeaveDays };
}

export function calculateSeverance(
  startDate: string,
  today: string,
  grossSalaryMinor: number,
): number {
  const years = Math.floor(yearsBetween(startDate, today));
  if (years < 1) return 0;
  const cappedMonthly = Math.min(grossSalaryMinor, SEVERANCE_CEILING_MINOR);
  return cappedMonthly * years;
}

export function generateMonthlyStatement(
  settings: Settings,
  dayEntries: Map<string, DayEntry>,
  extraIncomes: ExtraIncome[],
  year: number,
  month: number,
  cumulativeTaxableMinor: number = 0,
  templates: readonly ShiftTemplate[] = [],
): MonthlyStatement {
  const { start, end } = getPayPeriod(year, month, settings.payday);
  const periodDates = enumerateDays(start, end);
  const days = deriveDays(periodDates, dayEntries, settings, templates);

  const totalDays = periodDates.length;
  const workedDays = days.filter((d) => d.status === 'WORKED').length;
  const dailySalaryMinor = Math.round(settings.salaryMinor / 30);

  const dailyStandard = DAILY_STANDARD_BY_SCHEDULE[settings.workSchedule];
  let totalOvertimeMinutes = days.reduce((s, d) => s + d.overtimeMinutes, 0);

  for (const day of days) {
    if (day.status !== 'WORKED') continue;
    if (day.shiftNominalMinutes > 0) {
      const delta = day.shiftNominalMinutes - dailyStandard;
      if (delta > 0) totalOvertimeMinutes += delta;
    }
  }

  if (settings.workSchedule === 'EVERY_DAY') {
    for (const day of days) {
      if (dayOfWeek(day.localDate) === 0 && day.status === 'WORKED') {
        totalOvertimeMinutes += DAILY_STANDARD_MINUTES;
      }
    }
  }

  const overtimeMinor = calculateOvertime(totalOvertimeMinutes, settings.salaryMinor);

  const holidayWorkedDays = days.filter((d) => d.isHoliday && d.status === 'WORKED').length;
  const holidayBonusMinor = calculateHolidayBonus(holidayWorkedDays, dailySalaryMinor);

  const deductionMinor = calculateDeductions(days, dayEntries, settings.salaryMinor);
  const extraIncomeMinor = calculateExtraIncome(extraIncomes, start, end);

  const grossMinor = settings.salaryMinor + overtimeMinor + holidayBonusMinor
    - deductionMinor + extraIncomeMinor;

  const besDeductionMinor = settings.besEnabled
    ? calculateBes(settings.salaryMinor, settings.besRateBp, settings.salaryType)
    : 0;

  let sgkWorkerMinor = 0;
  let unemploymentWorkerMinor = 0;
  let incomeTaxMinor = 0;
  let stampTaxMinor = 0;

  if (settings.salaryType === 'GROSS') {
    sgkWorkerMinor = applyBp(grossMinor, SGK_WORKER_RATE_BP);
    unemploymentWorkerMinor = applyBp(grossMinor, UNEMPLOYMENT_WORKER_RATE_BP);
    const taxableMinor = grossMinor - sgkWorkerMinor - unemploymentWorkerMinor;
    incomeTaxMinor = calculateIncomeTax(taxableMinor, cumulativeTaxableMinor, year);
    stampTaxMinor = applyBp(grossMinor, STAMP_TAX_RATE_BP);
  }

  const netMinor = grossMinor - sgkWorkerMinor - unemploymentWorkerMinor
    - incomeTaxMinor - stampTaxMinor - besDeductionMinor;

  return {
    periodStart: start,
    periodEnd: end,
    salaryType: settings.salaryType,
    baseSalaryMinor: settings.salaryMinor,
    workedDays,
    totalDays,
    overtimeMinutes: totalOvertimeMinutes,
    overtimeMinor,
    holidayBonusMinor,
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
