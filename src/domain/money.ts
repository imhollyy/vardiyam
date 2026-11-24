/**
 * Formats raw decimal-pad input into Turkish locale display: "35000,50" → "35.000,50".
 * Keeps trailing comma and up to 2 decimal digits while user is typing.
 */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const commaIdx = cleaned.indexOf(',');
  if (commaIdx === -1) {
    if (cleaned === '') return '';
    const stripped = cleaned.replace(/^0+(\d)/, '$1');
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(stripped));
  }
  const wholeRaw = cleaned.slice(0, commaIdx).replace(/^0+(\d)/, '$1');
  const frac = cleaned.slice(commaIdx + 1, commaIdx + 3);
  const formattedWhole = wholeRaw === '' ? '0' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(wholeRaw));
  return `${formattedWhole},${frac}`;
}

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
  return `${negative ? '−' : ''}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(whole)},${fraction} ₺`;
}
