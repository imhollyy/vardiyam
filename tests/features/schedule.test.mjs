import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShiftSchedule, previewShiftSchedule } from '../../src/features/shifts/schedule.ts';

const templates = [
  { id: 'day', code: 'D', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { id: 'evening', code: 'E', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
  { id: 'night', code: 'N', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
];

function draft(pattern, extra = {}) {
  return {
    id: 'cycle',
    name: 'Üretim döngüsü',
    timezone: 'Europe/Istanbul',
    anchorLocalDate: '2026-01-01',
    pattern,
    startTemplateIndex: 0,
    templates,
    customEntries: [],
    ...extra,
  };
}

test('fixed pattern stores the selected start shift on the anchor date', () => {
  const built = buildShiftSchedule(draft('fixed', { startTemplateIndex: 1 }));
  assert.equal(built.cycle.entries.length, 1);
  assert.deepEqual(built.cycle.entries[0], { kind: 'SHIFT', templateId: 'evening' });
  assert.equal(built.cycle.startIndex, 0);
});

test('weekly three-shift and 2+2+2 presets use domain constructors and selected start phase', () => {
  const weekly = buildShiftSchedule(draft('weekly-three', { startTemplateIndex: 2 }));
  assert.equal(weekly.cycle.entries.length, 21);
  assert.equal(weekly.cycle.startIndex, 14);
  assert.deepEqual(weekly.cycle.entries.slice(0, 7), Array.from({ length: 7 }, () => ({ kind: 'SHIFT', templateId: 'day' })));

  const twoTwoTwo = buildShiftSchedule(draft('two-two-two', { startTemplateIndex: 1 }));
  assert.equal(twoTwoTwo.cycle.entries.length, 6);
  assert.equal(twoTwoTwo.cycle.startIndex, 2);
  assert.deepEqual(twoTwoTwo.cycle.entries.map((entry) => entry.templateId), [
    'day', 'day', 'evening', 'evening', 'night', 'night',
  ]);
});

test('editing a saved preset retains the exact startIndex inside a repeated shift run', () => {
  const edited = buildShiftSchedule(draft('weekly-three', {
    startTemplateIndex: 1,
    preservedStartEntryIndex: 10,
  }));
  assert.equal(edited.cycle.entries[10].templateId, 'evening');
  assert.equal(edited.cycle.startIndex, 10);
});

test('reopening a custom schedule preserves an OFF anchor phase', () => {
  const edited = buildShiftSchedule(draft('custom', {
    startTemplateIndex: 0,
    preservedStartEntryIndex: 1,
    customEntries: [
      { kind: 'SHIFT', templateIndex: 0 },
      { kind: 'OFF' },
      { kind: 'SHIFT', templateIndex: 1 },
    ],
  }));
  assert.equal(edited.cycle.startIndex, 1);
  assert.deepEqual(edited.cycle.entries[edited.cycle.startIndex], { kind: 'OFF' });
});

test('4+2 and 6+1 presets include OFF days without relabeling them as legal rest', () => {
  const fourTwo = buildShiftSchedule(draft('four-two', { startTemplateIndex: 1 }));
  assert.deepEqual(fourTwo.cycle.entries.map((entry) => entry.kind), [
    'SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'OFF', 'OFF',
  ]);
  assert.equal(fourTwo.cycle.entries[0].templateId, 'evening');

  const sixOne = buildShiftSchedule(draft('six-one'));
  assert.deepEqual(sixOne.cycle.entries.map((entry) => entry.kind), [
    'SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'SHIFT', 'OFF',
  ]);
});

test('custom pattern keeps chosen start shift and projects single dates through domain logic', () => {
  const custom = draft('custom', {
    startTemplateIndex: 1,
    customEntries: [
      { kind: 'SHIFT', templateIndex: 0 },
      { kind: 'OFF' },
      { kind: 'SHIFT', templateIndex: 1 },
    ],
  });
  const built = buildShiftSchedule(custom);
  assert.equal(built.cycle.startIndex, 2);
  const preview = previewShiftSchedule(custom, '2026-02-27', 5);
  assert.deepEqual(preview.map(({ localDate, kind }) => [localDate, kind]), [
    ['2026-02-27', 'SHIFT'],
    ['2026-02-28', 'SHIFT'],
    ['2026-03-01', 'OFF'],
    ['2026-03-02', 'SHIFT'],
    ['2026-03-03', 'SHIFT'],
  ]);
});

test('schedule builder rejects a custom start shift that does not appear in the cycle', () => {
  assert.throws(() => buildShiftSchedule(draft('custom', {
    startTemplateIndex: 2,
    customEntries: [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }],
  })), /Başlangıç vardiyası/);
});

test('schedule builder rejects incomplete weekly templates and invalid shift times', () => {
  assert.throws(() => buildShiftSchedule(draft('weekly-three', { templates: templates.slice(0, 2) })));
  assert.throws(() => buildShiftSchedule(draft('fixed', {
    templates: [{ ...templates[0], startLocalTime: '25:00' }],
  })));
  assert.throws(() => buildShiftSchedule(draft('fixed', { anchorLocalDate: '2026-02-29' })));
});
