import assert from 'node:assert/strict';
import test from 'node:test';

import { netShiftMinutes, calculateScheduledOvertime, WEEKLY_LIMIT_MINUTES } from '../../src/domain/payroll/overtime.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(id, start, end, breakMinutes) {
  return { id, code: id, name: id, startLocalTime: start, endLocalTime: end, breakMinutes, standardMinutes: 0 };
}

/**
 * Build a DerivedDay stub.
 * status defaults to 'WORKED', shiftTemplateId to tplId.
 */
function makeDay(localDate, tplId, overrides = {}) {
  return {
    localDate,
    status: 'WORKED',
    leaveType: null,
    leaveHalfDay: false,
    leaveHours: 0,
    overtimeMinutes: 0,
    lateEarlyMinutes: 0,
    isHoliday: false,
    isWeekend: false,
    shiftTemplateId: tplId,
    shiftNominalMinutes: 0,
    note: null,
    ...overrides,
  };
}

/** Mon-Fri week of 2025-11-17 to 2025-11-21 */
const MON_FRI_WEEK = ['2025-11-17', '2025-11-18', '2025-11-19', '2025-11-20', '2025-11-21'];

// ---------------------------------------------------------------------------
// netShiftMinutes
// ---------------------------------------------------------------------------

test('netShiftMinutes: 08:00–18:00, 60 dk mola → 540 dk', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 60);
  assert.equal(netShiftMinutes(tpl), 540);
});

test('netShiftMinutes: 08:00–18:00, 0 dk mola → 600 dk', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 0);
  assert.equal(netShiftMinutes(tpl), 600);
});

test('netShiftMinutes: gece vardiyası 22:00–08:00, 60 dk mola → 540 dk', () => {
  const tpl = makeTemplate('GC', '22:00', '08:00', 60);
  assert.equal(netShiftMinutes(tpl), 540);
});

test('netShiftMinutes: 08:00–16:00, 30 dk mola → 450 dk', () => {
  const tpl = makeTemplate('G', '08:00', '16:00', 30);
  assert.equal(netShiftMinutes(tpl), 450);
});

// ---------------------------------------------------------------------------
// calculateScheduledOvertime
// ---------------------------------------------------------------------------

test('Pzt–Cuma 08:00–18:00 60dk mola, hepsi çalışıldı → haftalık 45sa net = fazla mesai YOK', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 60); // 540 dk/gün × 5 = 2700 = limit
  const days = MON_FRI_WEEK.map((d) => makeDay(d, 'G'));
  const result = calculateScheduledOvertime(days, [tpl]);
  assert.equal(result.length, 0);
});

test('Pzt–Cuma 08:00–20:00 60dk mola → net 660dk/gün × 5 = 3300 → 600 dk fazla', () => {
  const tpl = makeTemplate('G', '08:00', '20:00', 60); // 720-60=660 dk/gün × 5 = 3300; fazla = 600
  const days = MON_FRI_WEEK.map((d) => makeDay(d, 'G'));
  const result = calculateScheduledOvertime(days, [tpl]);
  const total = result.reduce((s, r) => s + r.scheduledOvertimeMinutes, 0);
  assert.equal(total, 600);
  assert.equal(result.length, 5);
});

test('Pzt–Cuma 08:00–18:00 0dk mola → net 600dk/gün × 5 = 3000 → 300dk fazla', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 0); // 600 × 5 = 3000; fazla = 300
  const days = MON_FRI_WEEK.map((d) => makeDay(d, 'G'));
  const result = calculateScheduledOvertime(days, [tpl]);
  const total = result.reduce((s, r) => s + r.scheduledOvertimeMinutes, 0);
  assert.equal(total, 300);
});

test('Çarşamba OFF → 4 iş günü 660dk/gün = 2640 < 2700 → fazla mesai YOK', () => {
  const tpl = makeTemplate('G', '08:00', '20:00', 60); // 660 dk/gün
  const days = [
    makeDay('2025-11-17', 'G'),
    makeDay('2025-11-18', 'G'),
    makeDay('2025-11-19', 'G', { status: 'OFF', shiftTemplateId: null }),
    makeDay('2025-11-20', 'G'),
    makeDay('2025-11-21', 'G'),
  ];
  const result = calculateScheduledOvertime(days, [tpl]);
  assert.equal(result.length, 0);
});

test('Çarşamba LEAVE → 4 iş günü, 660dk/gün × 4 = 2640 < 2700 → fazla mesai YOK', () => {
  const tpl = makeTemplate('G', '08:00', '20:00', 60);
  const days = [
    makeDay('2025-11-17', 'G'),
    makeDay('2025-11-18', 'G'),
    makeDay('2025-11-19', 'G', { status: 'LEAVE', shiftTemplateId: null }),
    makeDay('2025-11-20', 'G'),
    makeDay('2025-11-21', 'G'),
  ];
  const result = calculateScheduledOvertime(days, [tpl]);
  assert.equal(result.length, 0);
});

test('shiftTemplateId null olan WORKED gün → 0 net dakika katkısı, limit aşılmaz', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 60);
  const days = MON_FRI_WEEK.map((d) => makeDay(d, null)); // template yok
  const result = calculateScheduledOvertime(days, [tpl]);
  assert.equal(result.length, 0);
});

test('İki ayrı hafta bağımsız hesaplanır: hafta1 fazlalık var, hafta2 yok', () => {
  const tpl = makeTemplate('G', '08:00', '20:00', 60); // 660 dk/gün
  // Hafta 1: 17-21 Kas 2025 (5 gün × 660 = 3300, fazla 600)
  // Hafta 2: 24-26 Kas 2025 (3 gün × 660 = 1980 < 2700, fazla 0)
  const days = [
    ...MON_FRI_WEEK.map((d) => makeDay(d, 'G')),
    makeDay('2025-11-24', 'G'),
    makeDay('2025-11-25', 'G'),
    makeDay('2025-11-26', 'G'),
  ];
  const result = calculateScheduledOvertime(days, [tpl]);
  const dates = result.map((r) => r.localDate);
  for (const d of MON_FRI_WEEK) assert.ok(dates.includes(d), `${d} hafta1'de fazla mesai olmalı`);
  for (const d of ['2025-11-24', '2025-11-25', '2025-11-26']) {
    assert.ok(!dates.includes(d), `${d} hafta2'de fazla mesai OLMAMALI`);
  }
});

test('WEEKLY_LIMIT_MINUTES sabiti 2700 (45 saat)', () => {
  assert.equal(WEEKLY_LIMIT_MINUTES, 45 * 60);
});

test('Özel weeklyLimitMinutes parametresi çalışır: limit 2000 dk', () => {
  const tpl = makeTemplate('G', '08:00', '18:00', 60); // 540 dk/gün
  const days = MON_FRI_WEEK.map((d) => makeDay(d, 'G')); // 5 × 540 = 2700
  const result = calculateScheduledOvertime(days, [tpl], 2000);
  const total = result.reduce((s, r) => s + r.scheduledOvertimeMinutes, 0);
  assert.equal(total, 700);
});
