import type { PayrollPeriod } from '../../data/paymentRepository.ts';
import { shiftYearMonth } from '../shifts/dates.ts';

function boundary(month: string, configuredDay: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(configuredDay, lastDay)).padStart(2, '0')}`;
}

export function payrollPeriodForMonth(month: string, configuredStartDay: number, timezone: string): PayrollPeriod {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(configuredStartDay) || configuredStartDay < 1 || configuredStartDay > 31) {
    throw new Error('Bordro dönemi seçimi geçersiz.');
  }
  const startLocalDate = boundary(month, configuredStartDay);
  const endExclusiveLocalDate = boundary(shiftYearMonth(month, 1), configuredStartDay);
  return { id: `period:${timezone}:${startLocalDate}:${endExclusiveLocalDate}`, startLocalDate, endExclusiveLocalDate, timezone, configuredStartDay };
}
