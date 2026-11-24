// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDayEntryPatch, buildSaveSummary } from './buildDayEntryPatch.ts';

function state(overrides = {}) {
  return {
    quickMode: null,
    overtimeHours: 0,
    lateEarlyHours: 0,
    leaveType: null,
    leaveHalfDay: false,
    leaveHourly: 0,
    leaveDeducted: false,
    shiftOverrideId: null,
    note: '',
    ...overrides,
  };
}

// ── Çakışma: izin aktifken mesai sıfırlanır ──────────────────────────────────

test('izin modu aktifken overtimeHours state değeri patch\'e aktarılmaz', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'ANNUAL',
    overtimeHours: 2,
    lateEarlyHours: 1,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.overtimeMinutes, 0);
  assert.equal(patch.lateEarlyMinutes, 0);
  assert.equal(patch.leaveType, 'ANNUAL');
});

test('mesai modu aktifken leaveType state değeri patch\'e aktarılmaz', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'overtime',
    overtimeHours: 2,
    leaveType: 'ANNUAL',
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveType, null);
  assert.equal(patch.overtimeMinutes, 120);
});

test('geç/erken modu aktifken leaveType patch\'e aktarılmaz', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'lateEarly',
    lateEarlyHours: 1,
    leaveType: 'SICK',
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveType, null);
  assert.equal(patch.lateEarlyMinutes, 60);
});

// ── Saatlik izin ─────────────────────────────────────────────────────────────

test('HOURLY izin: leaveHours doğru aktarılır', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'HOURLY',
    leaveHourly: 3,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveType, 'HOURLY');
  assert.equal(patch.leaveHours, 3);
});

test('HOURLY olmayan izin: leaveHours her zaman 0', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'ANNUAL',
    leaveHourly: 5,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveHours, 0);
});

// ── deductOverride: maaştan kesilsin ─────────────────────────────────────────

test('varsayılan kesilmez izin (ANNUAL) + leaveDeducted false → deductOverride null', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'ANNUAL',
    leaveDeducted: false,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.deductOverride, null);
});

test('varsayılan kesilmez izin (ANNUAL) + leaveDeducted true → deductOverride true', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'ANNUAL',
    leaveDeducted: true,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.deductOverride, true);
});

test('varsayılan kesilir izin (UNPAID) + leaveDeducted true → deductOverride null', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'UNPAID',
    leaveDeducted: true,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.deductOverride, null);
});

test('varsayılan kesilir izin (UNPAID) + leaveDeducted false → deductOverride false', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'UNPAID',
    leaveDeducted: false,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.deductOverride, false);
});

// ── Boş gün → silme ──────────────────────────────────────────────────────────

test('tüm değerler sıfır/boş → null (giriş silinmeli)', () => {
  assert.equal(buildDayEntryPatch(state()), null);
});

test('quickMode null, sadece not → note patch\'e girer', () => {
  const patch = buildDayEntryPatch(state({ note: 'Test notu' }));
  assert.ok(patch !== null);
  assert.equal(patch.note, 'Test notu');
});

test('sadece shiftOverrideId → patch döner', () => {
  const patch = buildDayEntryPatch(state({ quickMode: 'shiftOverride', shiftOverrideId: 'tmpl-1' }));
  assert.ok(patch !== null);
  assert.equal(patch.shiftOverrideId, 'tmpl-1');
});

// ── Yarım gün ────────────────────────────────────────────────────────────────

test('yarım gün izin: leaveHalfDay true aktarılır', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'leave',
    leaveType: 'ANNUAL',
    leaveHalfDay: true,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveHalfDay, true);
});

test('izin yokken leaveHalfDay her zaman false', () => {
  const patch = buildDayEntryPatch(state({
    quickMode: 'overtime',
    overtimeHours: 1,
    leaveHalfDay: true,
  }));
  assert.ok(patch !== null);
  assert.equal(patch.leaveHalfDay, false);
});

// ── buildSaveSummary ──────────────────────────────────────────────────────────

test('buildSaveSummary: mesai özeti', () => {
  assert.equal(buildSaveSummary(state({ quickMode: 'overtime', overtimeHours: 2 })), 'Kaydedilecek: +2 sa mesai');
});

test('buildSaveSummary: geç/erken özeti', () => {
  assert.equal(buildSaveSummary(state({ quickMode: 'lateEarly', lateEarlyHours: 1 })), 'Kaydedilecek: −1 sa geç/erken');
});

test('buildSaveSummary: izin özeti', () => {
  assert.equal(buildSaveSummary(state({ quickMode: 'leave', leaveType: 'ANNUAL' })), 'Kaydedilecek: Yıllık izin');
});

test('buildSaveSummary: yarım gün izin özeti', () => {
  assert.equal(buildSaveSummary(state({ quickMode: 'leave', leaveType: 'SICK', leaveHalfDay: true })), 'Kaydedilecek: Yarım gün — Hastalık raporu');
});

test('buildSaveSummary: null moda veya sıfır saate null döner', () => {
  assert.equal(buildSaveSummary(state()), null);
  assert.equal(buildSaveSummary(state({ quickMode: 'overtime', overtimeHours: 0 })), null);
  assert.equal(buildSaveSummary(state({ quickMode: 'leave', leaveType: null })), null);
});
