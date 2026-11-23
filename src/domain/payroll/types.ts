export type SalaryType = 'GROSS' | 'NET';
export type WorkSchedule = 'MON_FRI' | 'MON_SAT' | 'EVERY_DAY';
export type ShiftPattern = 'TWO_SHIFT' | 'THREE_SHIFT' | 'FIXED_DAY' | 'FIXED_NIGHT';
export type LeaveType = 'ANNUAL' | 'UNPAID' | 'SICK' | 'EXCUSE' | 'MATERNITY' | 'BEREAVEMENT' | 'SOCIAL' | 'HOURLY' | 'HOLIDAY';
export type ExtraIncomeType = 'BONUS' | 'TRANSPORT' | 'FOOD' | 'SOCIAL' | 'PERFORMANCE' | 'OTHER';
export type ExtraIncomeFrequency = 'MONTHLY' | 'ONCE' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';

export type Settings = {
  salaryMinor: number;
  salaryType: SalaryType;
  payday: string;
  besEnabled: boolean;
  besRateBp: number;
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  startDate: string | null;
  setupCompleted: boolean;
};

export type DayEntry = {
  localDate: string;
  shiftOverrideId: string | null;
  overtimeMinutes: number;
  lateEarlyMinutes: number;
  leaveType: LeaveType | null;
  leaveHalfDay: boolean;
  leaveHours: number;
  deductOverride: boolean | null;
  note: string | null;
};

export type ExtraIncome = {
  id: string;
  type: ExtraIncomeType;
  customName: string | null;
  amountMinor: number;
  frequency: ExtraIncomeFrequency;
  firstPaymentDate: string | null;
  createdAt: string;
};

export type DayStatus = 'WORKED' | 'OFF' | 'LEAVE' | 'HOLIDAY';

export type DerivedDay = {
  localDate: string;
  status: DayStatus;
  leaveType: LeaveType | null;
  leaveHalfDay: boolean;
  leaveHours: number;
  overtimeMinutes: number;
  lateEarlyMinutes: number;
  isHoliday: boolean;
  isWeekend: boolean;
  shiftTemplateId: string | null;
  shiftNominalMinutes: number;
  note: string | null;
};

export type MonthlyStatement = {
  periodStart: string;
  periodEnd: string;
  salaryType: SalaryType;
  baseSalaryMinor: number;
  workedDays: number;
  totalDays: number;
  scheduledOvertimeMinutes: number;
  manualOvertimeMinutes: number;
  overtimeMinutes: number;
  overtimeMinor: number;
  holidayBonusMinor: number;
  deductionMinor: number;
  extraIncomeMinor: number;
  besDeductionMinor: number;
  grossMinor: number;
  sgkWorkerMinor: number;
  unemploymentWorkerMinor: number;
  stampTaxMinor: number;
  incomeTaxMinor: number;
  netMinor: number;
};

export type AnnualLeaveResult = {
  earnedDays: number;
  usedDays: number;
  remainingDays: number;
};
