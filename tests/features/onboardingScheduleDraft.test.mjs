import assert from 'node:assert/strict';
import test from 'node:test';

import {
  changesHistoricalPlan, previewNext30Days, scheduleDraftFromCycle,
  scheduleDraftForBuild, validateSavedScheduleDraft,
} from '../../src/features/onboarding/scheduleDraft.ts';

const templates = [
  { id: 'shift-day', code: 'D', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { id: 'shift-night', code: 'N', name: 'Gece', startLocalTime: '20:00', endLocalTime: '04:00' },
];

function cycle(overrides = {}) {
  return {
    id: 'existing-cycle', name: 'Saved name', timezone: 'Europe/Istanbul',
    anchorLocalDate: '2026-01-01', startIndex: 1,
    entries: [{ kind: 'SHIFT', templateId: 'shift-day' }, { kind: 'OFF' }, { kind: 'SHIFT', templateId: 'shift-night' }],
    ...overrides,
  };
}

test('reopening maps the actual cycle sequence and preserves template and cycle identities without guessing its name', () => {
  const draft = scheduleDraftFromCycle(cycle(), templates);
  assert.equal(draft.pattern, 'custom');
  assert.equal(draft.baselinePatternUnknown, true);
  assert.equal(draft.cycleId, 'existing-cycle');
  assert.equal(draft.templates[0].id, 'shift-day');
  assert.equal(draft.templates[1].id, 'shift-night');
  assert.deepEqual(draft.customEntries, [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }, { kind: 'SHIFT', templateIndex: 1 }]);
  assert.equal(draft.startEntryIndex, 1);
  assert.equal(scheduleDraftForBuild(draft).id, 'existing-cycle');
  assert.equal(validateSavedScheduleDraft(draft), true);
});

test('30-day upcoming preview crosses month and year boundaries with exactly 30 local dates', () => {
  const draft = scheduleDraftFromCycle(cycle({ anchorLocalDate: '2026-12-20' }), templates);
  const preview = previewNext30Days(draft, '2026-12-20');
  assert.equal(preview.length, 30);
  assert.equal(preview[0].localDate, '2026-12-20');
  assert.equal(preview[12].localDate, '2027-01-01');
  assert.equal(preview.at(-1).localDate, '2027-01-18');
  assert.equal(preview[0].kind, 'OFF');
  assert.equal(preview.some((day) => day.kind === 'SHIFT' && day.templateId === 'shift-night'), true);
});

test('preview is a projection only and does not mutate the source draft or cycle', () => {
  const saved = cycle();
  const draft = scheduleDraftFromCycle(saved, templates);
  const before = structuredClone(draft);
  previewNext30Days(draft, '2026-01-01');
  assert.deepEqual(draft, before);
  assert.equal(saved.id, 'existing-cycle');
  assert.equal(saved.entries.length, 3);
});

test('historical plan change is false for unchanged schedule and true for changed past time/phase', () => {
  const original = scheduleDraftFromCycle(cycle(), templates);
  assert.equal(changesHistoricalPlan(original, '2026-01-10'), false);
  const changedTime = { ...original, templates: original.templates.map((item) => item.id === 'shift-day' ? { ...item, startLocalTime: '09:00' } : item) };
  assert.equal(changesHistoricalPlan(changedTime, '2026-01-10'), true);
  const changedPhase = { ...original, startEntryIndex: 2 };
  assert.equal(changesHistoricalPlan(changedPhase, '2026-01-10'), true);
});

test('missing baseline and projection spans beyond supported bound fail safely', () => {
  const fresh = {
    version: 1, pattern: 'fixed', anchorLocalDate: '2026-01-01', startTemplateIndex: 0,
    startEntryIndex: 0, cycleId: 'new-cycle', templates: [templates[0]],
    customEntries: [], baseline: null, baselinePatternUnknown: false,
  };
  assert.equal(changesHistoricalPlan(fresh, '2026-01-10'), false);
  const old = scheduleDraftFromCycle(cycle({ anchorLocalDate: '2000-01-01' }), templates);
  assert.equal(changesHistoricalPlan({ ...old, templates: old.templates.map((item) => ({ ...item, startLocalTime: '09:00' })) }, '2026-11-01'), true);
});

test('malformed persisted baseline is rejected so onboarding can safely rehydrate the saved cycle', () => {
  const saved = scheduleDraftFromCycle(cycle(), templates);
  assert.equal(validateSavedScheduleDraft({ ...saved, baseline: { cycle: { entries: [] }, templates: [] } }), false);
  assert.equal(validateSavedScheduleDraft({ ...saved, baseline: { cycle: null, templates: [] } }), false);
});
