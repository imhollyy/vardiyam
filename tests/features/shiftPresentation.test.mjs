import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarCellAccessibilityLabel, calendarMarker, calendarMonthDates, calendarMonthSlots, canStartClockIn, hasUnsavedPlanDraft, shiftIconForStartTime } from '../../src/features/shifts/presentation.ts';

test('shift time icons distinguish day, evening and night work', () => {
  assert.equal(shiftIconForStartTime('08:00'), 'sunny-outline');
  assert.equal(shiftIconForStartTime('16:00'), 'partly-sunny-outline');
  assert.equal(shiftIconForStartTime('22:00'), 'moon-outline');
  assert.equal(shiftIconForStartTime('02:00'), 'moon-outline');
});

test('primary clock-in is unavailable with an active session or a completed same-day record', () => {
  assert.equal(canStartClockIn(false, false), true);
  assert.equal(canStartClockIn(true, false), false);
  assert.equal(canStartClockIn(false, true), false);
});

test('calendar confirms discarding a changed day plan draft', () => {
  assert.equal(hasUnsavedPlanDraft('{"kind":"SHIFT"}', '{"kind":"OFF"}'), true);
  assert.equal(hasUnsavedPlanDraft('{"kind":"SHIFT"}', '{"kind":"SHIFT"}'), false);
});

test('calendar status markers keep semantic icons and tones beyond color alone', () => {
  assert.deepEqual(calendarMarker({ planKind: 'SHIFT', startLocalTime: '08:00' }), { icon: 'sunny-outline', tone: 'accent' });
  assert.deepEqual(calendarMarker({ planKind: 'OFF' }), { icon: 'bed-outline', tone: 'muted' });
  assert.deepEqual(calendarMarker({ planKind: 'LEAVE' }), { icon: 'bed-outline', tone: 'warning' });
  assert.deepEqual(calendarMarker({ status: 'SICK_REPORT' }), { icon: 'medkit-outline', tone: 'warning' });
  assert.deepEqual(calendarMarker({ status: 'NOT_WORKED' }), { icon: 'close-circle', tone: 'danger' });
  assert.deepEqual(calendarMarker({ completed: true }), { icon: 'checkmark-circle', tone: 'success' });
});

test('calendar projection includes every real February date while leading alignment cells stay separate', () => {
  const dates = calendarMonthDates('2026-02');
  assert.equal(dates.length, 28);
  assert.equal(dates[0], '2026-02-01');
  assert.equal(dates.at(-1), '2026-02-28');
  assert.equal(dates.includes('2026-02-15'), true);
});

test('empty-data month slots remain interactive days while alignment padding is noninteractive', () => {
  const slots = calendarMonthSlots('2026-02');
  const alignment = slots.filter((slot) => slot.kind === 'padding');
  const days = slots.filter((slot) => slot.kind === 'day');
  assert.equal(alignment.length, 6);
  assert.equal(alignment.every((slot) => slot.interactive === false), true);
  assert.equal(days.length, 28);
  assert.equal(days.every((slot) => slot.interactive === true), true);
  assert.deepEqual(days.find((slot) => slot.date === '2026-02-15'), { kind: 'day', date: '2026-02-15', interactive: true });
});

test('an empty real calendar day has an explicit accessible name and muted empty marker', () => {
  assert.equal(calendarCellAccessibilityLabel('15 Şubat 2026 Pazar', 'Plan yok', false, null), '15 Şubat 2026 Pazar, Plan yok');
  assert.deepEqual(calendarMarker({}), { icon: 'remove-outline', tone: 'muted' });
});
