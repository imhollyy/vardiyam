export type PaymentMethod = 'BANK' | 'CASH' | 'OTHER';

export type PayrollPeriodIdentity = {
  id: string;
  startLocalDate: string;
  endExclusiveLocalDate: string;
  timezone: string;
  configuredStartDay: number;
};

export type PaymentReconciliation = {
  payslipNetMinor: number | null;
  allocatedPaymentMinor: number;
  differenceMinor: number | null;
  /** Includes unallocated portions of active payments only. */
  unallocatedPaymentMinor: number;
};

/** Parses either 35.000,50 or 35000.50; ambiguous/mixed separators are rejected. */
export function parseTryMinor(input: string, allowZero = false): number {
  const value = input.trim().replace(/\s/g, '');
  const localized = /^(?:0|[1-9]\d{0,2}(?:\.\d{3})*|[1-9]\d*),\d{1,2}$/.test(value);
  const groupedWholeLira = /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(value);
  const decimalDot = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value);
  if (!localized && !groupedWholeLira && !decimalDot) throw new Error('Tutarı 35.000,50; 35.000 veya 35000.50 biçiminde gir.');
  const normalized = localized ? value.replace(/\./g, '').replace(',', '.') : groupedWholeLira ? value.replace(/\./g, '') : value;
  const [whole = '', fraction = ''] = normalized.split('.');
  const minorBig = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minorBig < (allowZero ? 0n : 1n) || minorBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(allowZero ? 'Tutar sıfır veya pozitif güvenli kuruş aralığında olmalı.' : 'Tutar sıfırdan büyük ve güvenli kuruş aralığında olmalı.');
  return Number(minorBig);
}

export function formatTryMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error('Tutar güvenli kuruş tam sayısı değil.');
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = Number(absolute / 100n);
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '−' : ''}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(whole)},${fraction}\u00a0₺`;
}

export function reconcileNetPayments(
  payslipNetMinor: number | null,
  allocatedPaymentMinor: number,
  unallocatedPaymentMinor: number,
): PaymentReconciliation {
  for (const amount of [allocatedPaymentMinor, unallocatedPaymentMinor]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Ödeme toplamları güvenli kuruş tam sayısı olmalı.');
  }
  if (payslipNetMinor !== null && (!Number.isSafeInteger(payslipNetMinor) || payslipNetMinor < 0)) {
    throw new Error('Bordro neti sıfır veya pozitif kuruş tam sayısı olmalı.');
  }
  const differenceMinor = payslipNetMinor === null ? null : payslipNetMinor - allocatedPaymentMinor;
  return { payslipNetMinor, allocatedPaymentMinor, differenceMinor, unallocatedPaymentMinor };
}

export function validateLocalDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Tarih YYYY-AA-GG biçiminde olmalı.');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Geçerli bir takvim tarihi gir.');
}
