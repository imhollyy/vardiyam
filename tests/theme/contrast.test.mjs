/**
 * WCAG 2.1 contrast ratio tests for Vardiya Blokları token pairs.
 * Normal text ≥ 4.5:1 (AA), large text ≥ 3:1.
 * Fails if any text token pair falls below threshold.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function sRGB(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}

function contrast(hex1, hex2) {
  const L1 = luminance(hex1);
  const L2 = luminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const NORMAL_TEXT_MIN = 4.5;
const LARGE_TEXT_MIN = 3.0;

function assertContrast(label, fg, bg, min = NORMAL_TEXT_MIN) {
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= min,
    `Kontrast yetersiz [${label}]: ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (min ${min}:1)`,
  );
}

// ─── Light theme ─────────────────────────────────────────────────────────────
const light = {
  background:     '#F6F2EA',
  surface:        '#FFFFFF',
  surfaceMuted:   '#F1ECE2',
  inkCard:        '#1B1A17',
  ink:            '#1B1A17',
  onInk:          '#F6F2EA',
  muted:          '#5E5A51',
  inverse:        '#1B1A17',
  onInverse:      '#F6F2EA',
  success:        '#13875B',
  onSuccess:      '#FFFFFF',
  danger:         '#A3261E',
  onDanger:       '#FFFFFF',
  primaryAction:  '#2449C9',
  onPrimaryAction:'#F6F2EA',
};

// ─── Dark theme ──────────────────────────────────────────────────────────────
const dark = {
  background:     '#14130F',
  surface:        '#1F1D18',
  surfaceMuted:   '#2A2721',
  inkCard:        '#2B2820',
  ink:            '#F3EEE3',
  onInk:          '#F6F2EA',  // cream on inkCard dark surface
  muted:          '#B5AD9C',
  inverse:        '#F3EEE3',
  onInverse:      '#1B1A17',
  success:        '#66D9A4',
  onSuccess:      '#14130F',
  danger:         '#FF9B8F',
  onDanger:       '#14130F',
  primaryAction:  '#8FA8FF',
  onPrimaryAction:'#14130F',
};

// ─── Shift palette ────────────────────────────────────────────────────────────
const shifts = {
  day:     { background: '#FFD166', text: '#1B1A17', textSecondary: '#5A4300' },
  eveningL: { background: '#7DB7F0', text: '#0B2540', textSecondary: '#1A3D6E' },
  eveningD: { background: '#5A9BE0', text: '#0B2540', textSecondary: '#1A3D6E' },
  nightL:  { background: '#23305E', text: '#FFFFFF', textSecondary: '#B4C4FF' },
  nightD:  { background: '#3A4A8C', text: '#FFFFFF', textSecondary: '#B4C4FF' },
  leaveL:  { background: '#9BE1C4', text: '#0F3B2A', textSecondary: '#1E6B4D' },
  leaveD:  { background: '#7FD3B0', text: '#0F3B2A', textSecondary: '#1E6B4D' },
  holidayL:{ background: '#E8E2D6', text: '#5E5A51', textSecondary: '#8B8577' },
  holidayD:{ background: '#2F2C25', text: '#B5AD9C', textSecondary: '#8B8577' },
};

// ─── Light theme pairs ────────────────────────────────────────────────────────
test('light: ink on background', () => assertContrast('light ink/bg', light.ink, light.background));
test('light: ink on surface', () => assertContrast('light ink/surface', light.ink, light.surface));
test('light: ink on surfaceMuted', () => assertContrast('light ink/surfaceMuted', light.ink, light.surfaceMuted));
test('light: muted on background', () => assertContrast('light muted/bg', light.muted, light.background));
test('light: muted on surface', () => assertContrast('light muted/surface', light.muted, light.surface));
test('light: onInk on inkCard', () => assertContrast('light onInk/inkCard', light.onInk, light.inkCard));
test('light: onInverse on inverse', () => assertContrast('light onInverse/inverse', light.onInverse, light.inverse));
test('light: onSuccess on success', () => assertContrast('light onSuccess/success', light.onSuccess, light.success));
test('light: onDanger on danger', () => assertContrast('light onDanger/danger', light.onDanger, light.danger));
test('light: onPrimaryAction on primaryAction', () => assertContrast('light onPA/primaryAction', light.onPrimaryAction, light.primaryAction));

// ─── Dark theme pairs ─────────────────────────────────────────────────────────
test('dark: ink on background', () => assertContrast('dark ink/bg', dark.ink, dark.background));
test('dark: ink on surface', () => assertContrast('dark ink/surface', dark.ink, dark.surface));
test('dark: ink on surfaceMuted', () => assertContrast('dark ink/surfaceMuted', dark.ink, dark.surfaceMuted));
test('dark: muted on background', () => assertContrast('dark muted/bg', dark.muted, dark.background));
test('dark: muted on surface', () => assertContrast('dark muted/surface', dark.muted, dark.surface));
test('dark: onInk on inkCard', () => assertContrast('dark onInk/inkCard', dark.onInk, dark.inkCard));
test('dark: onInverse on inverse', () => assertContrast('dark onInverse/inverse', dark.onInverse, dark.inverse));
test('dark: onSuccess on success', () => assertContrast('dark onSuccess/success', dark.onSuccess, dark.success));
test('dark: onDanger on danger', () => assertContrast('dark onDanger/danger', dark.onDanger, dark.danger));
test('dark: onPrimaryAction on primaryAction', () => assertContrast('dark onPA/primaryAction', dark.onPrimaryAction, dark.primaryAction));

// ─── Shift palette pairs (large text minimum 3:1) ────────────────────────────
test('shift day: text on bg', () => assertContrast('day text/bg', shifts.day.text, shifts.day.background, LARGE_TEXT_MIN));
test('shift day: textSecondary on bg', () => assertContrast('day secondary/bg', shifts.day.textSecondary, shifts.day.background, LARGE_TEXT_MIN));
test('shift evening light: text on bg', () => assertContrast('eveningL text/bg', shifts.eveningL.text, shifts.eveningL.background, NORMAL_TEXT_MIN));
test('shift evening dark: text on bg', () => assertContrast('eveningD text/bg', shifts.eveningD.text, shifts.eveningD.background, NORMAL_TEXT_MIN));
test('shift night light: text on bg', () => assertContrast('nightL text/bg', shifts.nightL.text, shifts.nightL.background, LARGE_TEXT_MIN));
test('shift night dark: text on bg', () => assertContrast('nightD text/bg', shifts.nightD.text, shifts.nightD.background, LARGE_TEXT_MIN));
test('shift leave light: text on bg', () => assertContrast('leaveL text/bg', shifts.leaveL.text, shifts.leaveL.background, LARGE_TEXT_MIN));
test('shift leave dark: text on bg', () => assertContrast('leaveD text/bg', shifts.leaveD.text, shifts.leaveD.background, LARGE_TEXT_MIN));
test('shift holiday light: text on bg', () => assertContrast('holidayL text/bg', shifts.holidayL.text, shifts.holidayL.background, LARGE_TEXT_MIN));
test('shift holiday dark: text on bg', () => assertContrast('holidayD text/bg', shifts.holidayD.text, shifts.holidayD.background, LARGE_TEXT_MIN));

// Evening vs Night luminance distinction (color-blindness accessibility)
test('shift evening light vs night light: luminance difference > 0.2', () => {
  const diff = Math.abs(luminance(shifts.eveningL.background) - luminance(shifts.nightL.background));
  assert.ok(diff > 0.2, `Evening/Night luminance too close: diff=${diff.toFixed(3)}`);
});
test('shift evening dark vs night dark: luminance difference > 0.2', () => {
  const diff = Math.abs(luminance(shifts.eveningD.background) - luminance(shifts.nightD.background));
  assert.ok(diff > 0.2, `Evening/Night dark luminance too close: diff=${diff.toFixed(3)}`);
});
