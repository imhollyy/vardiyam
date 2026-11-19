export const WEEKLY_STANDARD_HOURS = 45;
export const DAILY_STANDARD_HOURS = 7.5;
export const WEEKLY_STANDARD_MINUTES = WEEKLY_STANDARD_HOURS * 60;
export const DAILY_STANDARD_MINUTES = DAILY_STANDARD_HOURS * 60;

export const OVERTIME_MULTIPLIER_BP = 15000;
export const HOLIDAY_MULTIPLIER_BP = 20000;
export const WEEKEND_MULTIPLIER_BP = 20000;

export type LeaveTypeConfig = {
  code: string;
  label: string;
  paid: boolean;
  deductFromSalary: boolean;
};

export const LEAVE_TYPES: readonly LeaveTypeConfig[] = [
  { code: 'ANNUAL', label: 'Yıllık izin', paid: true, deductFromSalary: false },
  { code: 'UNPAID', label: 'Ücretsiz izin', paid: false, deductFromSalary: true },
  { code: 'SICK', label: 'Hastalık raporu', paid: false, deductFromSalary: true },
  { code: 'EXCUSE', label: 'Mazeret izni', paid: true, deductFromSalary: false },
  { code: 'MATERNITY', label: 'Doğum izni', paid: false, deductFromSalary: true },
  { code: 'BEREAVEMENT', label: 'Ölüm izni', paid: true, deductFromSalary: false },
  { code: 'SOCIAL', label: 'Sosyal izin', paid: true, deductFromSalary: false },
  { code: 'HOURLY', label: 'Saatlik izin', paid: true, deductFromSalary: false },
  { code: 'HOLIDAY', label: 'Resmî tatil', paid: true, deductFromSalary: false },
] as const;

export type AnnualLeaveTier = {
  minYears: number;
  maxYears: number | null;
  days: number;
};

export const ANNUAL_LEAVE_TIERS: readonly AnnualLeaveTier[] = [
  { minYears: 1, maxYears: 5, days: 14 },
  { minYears: 5, maxYears: 15, days: 20 },
  { minYears: 15, maxYears: null, days: 26 },
] as const;

export const SEVERANCE_CEILING_MINOR = 2_384_437;

export const SGK_WORKER_RATE_BP = 1400;
export const SGK_EMPLOYER_RATE_BP = 2050;
export const UNEMPLOYMENT_WORKER_RATE_BP = 100;
export const UNEMPLOYMENT_EMPLOYER_RATE_BP = 200;
export const STAMP_TAX_RATE_BP = 759;

export type IncomeTaxBracket = {
  upperLimitMinor: number;
  rateBp: number;
};

export const INCOME_TAX_BRACKETS_2025: readonly IncomeTaxBracket[] = [
  { upperLimitMinor: 158_000_00, rateBp: 1500 },
  { upperLimitMinor: 330_000_00, rateBp: 2000 },
  { upperLimitMinor: 800_000_00, rateBp: 2700 },
  { upperLimitMinor: 4_300_000_00, rateBp: 3500 },
  { upperLimitMinor: Infinity, rateBp: 4000 },
] as const;
