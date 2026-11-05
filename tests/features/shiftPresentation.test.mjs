import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarMarker, canStartClockIn, hasUnsavedPlanDraft, shiftIconForStartTime } from '../../src/features/shifts/presentation.ts';

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
