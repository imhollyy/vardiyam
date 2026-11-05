import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePickerDraft, pickerDateValue, localTimeForPicker } from '../../src/features/shifts/nativePicker.ts';

test('a nonexistent DST-gap time is normalized to the time actually shown by the picker', () => {
  const resolved = pickerDateValue('time', '02:30', 'Europe/Berlin', '2026-03-29');
  assert.equal(localTimeForPicker(resolved, 'Europe/Berlin'), '03:00');
  assert.equal(normalizePickerDraft('time', '02:30', 'Europe/Berlin', '2026-03-29'), '03:00');
});

test('a valid wall-clock time remains unchanged by picker normalization', () => {
  assert.equal(normalizePickerDraft('time', '09:45', 'Europe/Istanbul', '2026-11-06'), '09:45');
});
