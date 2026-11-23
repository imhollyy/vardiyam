export const WEEKLY_STANDARD_HOURS = 45;
export const DAILY_STANDARD_HOURS = 7.5;
export const WEEKLY_STANDARD_MINUTES = WEEKLY_STANDARD_HOURS * 60;
export const DAILY_STANDARD_MINUTES = DAILY_STANDARD_HOURS * 60;
export const HOURLY_RATE_DIVISOR = 225;

export const OVERTIME_MULTIPLIER_BP = 15000;
export const HOLIDAY_MULTIPLIER_BP = 20000;

export type LeaveTypeConfig = {
  code: string;
  label: string;
  deductFromSalary: boolean;
  description: string;
};

export const LEAVE_TYPES: readonly LeaveTypeConfig[] = [
  { code: 'ANNUAL', label: 'Yıllık izin', deductFromSalary: false, description: 'Yıllık izin bakiyesinden düşer' },
  { code: 'UNPAID', label: 'Ücretsiz izin', deductFromSalary: true, description: 'O günün ücreti kesilir' },
  { code: 'SICK', label: 'Raporlu', deductFromSalary: false, description: 'Rapor parası SGK\'dan ödenir, maaştan kesilmez varsayılır' },
  { code: 'EXCUSE', label: 'Mazeret izni', deductFromSalary: true, description: 'O günün ücreti kesilir' },
  { code: 'MATERNITY', label: 'Doğum izni', deductFromSalary: false, description: 'Maaştan kesilmez' },
  { code: 'BEREAVEMENT', label: 'Ölüm izni', deductFromSalary: false, description: 'Maaştan kesilmez' },
  { code: 'SOCIAL', label: 'Sosyal / idari izin', deductFromSalary: false, description: 'Maaştan kesilmez' },
  { code: 'HOURLY', label: 'Saatlik izin', deductFromSalary: true, description: 'Girilen saat kadar kesilir' },
  { code: 'HOLIDAY', label: 'Resmî tatil', deductFromSalary: false, description: 'Maaştan kesilmez' },
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

// 2024 H2 dönemi tavanı; yılda iki kez güncellenir
export const SEVERANCE_CEILING_MINOR = 2_384_437;

export const BES_DEFAULT_RATE_BP = 300;
export const NET_TO_GROSS_RATIO_BP = 6500;

export const SGK_WORKER_RATE_BP = 1400;
export const SGK_EMPLOYER_RATE_BP = 2050;
export const UNEMPLOYMENT_WORKER_RATE_BP = 100;
export const UNEMPLOYMENT_EMPLOYER_RATE_BP = 200;
export const STAMP_TAX_RATE_BP = 759;

export type IncomeTaxBracket = {
  upperLimitMinor: number;
  rateBp: number;
};

export const INCOME_TAX_BRACKETS: Record<number, readonly IncomeTaxBracket[]> = {
  2025: [
    { upperLimitMinor: 158_000_00, rateBp: 1500 },
    { upperLimitMinor: 330_000_00, rateBp: 2000 },
    { upperLimitMinor: 800_000_00, rateBp: 2700 },
    { upperLimitMinor: 4_300_000_00, rateBp: 3500 },
    { upperLimitMinor: Infinity, rateBp: 4000 },
  ],
};

export function getIncomeTaxBrackets(year: number): readonly IncomeTaxBracket[] {
  if (INCOME_TAX_BRACKETS[year]) return INCOME_TAX_BRACKETS[year];
  const knownYears = Object.keys(INCOME_TAX_BRACKETS).map(Number).sort((a, b) => b - a);
  return INCOME_TAX_BRACKETS[knownYears[0]!]!;
}
