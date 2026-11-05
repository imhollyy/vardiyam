import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseReportsReward, summarizeReports } from '../../src/features/reports/reportSummary.ts';

const record = {
  record: { id: 'r1', startedAtUtc: '2026-11-05T06:00:00.000Z', endedAtUtc: '2026-11-05T14:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 30 },
  timedBreaks: [],
};
const snapshot = (calculationId, createdAtUtc, amountMinor) => ({
  calculationId, createdAtUtc, profileId: 'default', profileVersion: 1, ruleVersionId: 'rules-v1', input: {},
  result: { status: 'COMPLETE', totalAmountMinor: amountMinor, uncertainties: [], snapshot: { lines: [{
    id: 'r1:segment-a', localDate: '2026-11-05', selectedRuleKind: 'OVERTIME', minutes: 60, amountMinor,
  }] } },
});

test('report summary separates recorded time, planned duration difference, and approved lines', () => {
  const value = summarizeReports({
    range: { start: '2026-11-01', endExclusive: '2026-12-01' },
    records: [record],
    statuses: [{ localDate: '2026-11-03', status: 'LEAVE', note: null, updatedAtUtc: '2026-11-03T00:00:00.000Z' }],
    plans: [{ localDate: '2026-11-05', kind: 'SHIFT', templateId: 't1', cycleId: 'c1', cycleIndex: 0, source: 'CYCLE', timezone: 'Europe/Istanbul' }],
    templates: [{ id: 't1', name: 'Gündüz', code: 'G', startLocalTime: '09:00', endLocalTime: '17:00' }],
    snapshots: [snapshot('c1', '2026-11-05T15:00:00.000Z', 12_500)],
  });
  assert.equal(value.workedMinutes, 480);
  assert.equal(value.unallocatedBreakMinutes, 30);
  assert.equal(value.durationDifferenceMinutes, 0);
  assert.equal(value.overtimeMinutes, 60);
  assert.equal(value.approvedGrossMinor, 12_500);
  assert.equal(value.completedDays, 1);
  assert.equal(value.leaveDays, 1);
});

test('overnight records are apportioned by local date across day, week, and month boundaries', () => {
  const overnight = {
    record: { id: 'overnight', startedAtUtc: '2026-10-31T20:00:00.000Z', endedAtUtc: '2026-11-01T05:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 30 },
    timedBreaks: [{ id: 'b1', startedAtUtc: '2026-11-01T00:00:00.000Z', endedAtUtc: '2026-11-01T00:30:00.000Z' }],
  };
  const summarize = (start, endExclusive) => summarizeReports({
    range: { start, endExclusive }, records: [overnight], statuses: [], plans: [], templates: [], snapshots: [],
  });
  // Local 23:00–08:00 crosses Oct/Nov midnight: 60m belongs to Oct 31, 480m to Nov 1.
  assert.equal(summarize('2026-11-01', '2026-11-02').workedMinutes, 450);
  assert.equal(summarize('2026-10-31', '2026-11-01').workedMinutes, 60);
  assert.equal(summarize('2026-11-01', '2026-11-08').workedMinutes, 450);
  assert.equal(summarize('2026-10-01', '2026-11-01').workedMinutes, 60);
  assert.equal(summarize('2026-11-01', '2026-12-01').workedMinutes, 450);
});

test('overnight records split at the local week boundary', () => {
  const overnight = {
    record: { id: 'weeknight', startedAtUtc: '2026-11-01T20:00:00.000Z', endedAtUtc: '2026-11-02T05:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 30 },
    timedBreaks: [{ id: 'b1', startedAtUtc: '2026-11-02T00:00:00.000Z', endedAtUtc: '2026-11-02T00:30:00.000Z' }],
  };
  const summarize = (start, endExclusive) => summarizeReports({
    range: { start, endExclusive }, records: [overnight], statuses: [], plans: [], templates: [], snapshots: [],
  });
  // Sunday 23:00–Monday 08:00 local; the weekly reports receive the matching date slices.
  assert.equal(summarize('2026-11-01', '2026-11-02').workedMinutes, 60);
  assert.equal(summarize('2026-11-02', '2026-11-09').workedMinutes, 450);
});

test('a later approved calculation replaces the same line instead of double counting it', () => {
  const value = summarizeReports({
    range: { start: '2026-11-01', endExclusive: '2026-12-01' }, records: [], statuses: [], plans: [], templates: [],
    snapshots: [snapshot('old', '2026-11-05T15:00:00.000Z', 12_500), snapshot('new', '2026-11-06T15:00:00.000Z', 14_000)],
  });
  assert.equal(value.approvedGrossMinor, 14_000);
  assert.equal(value.overtimeMinutes, 60);
});

test('reward access can be granted only once per local calendar date and expires after 24 hours', () => {
  const now = '2026-11-05T12:00:00.000Z';
  assert.equal(canUseReportsReward({ lastUsedLocalDate: null, expiresAtUtc: null }, now, '2026-11-05'), true);
  assert.equal(canUseReportsReward({ lastUsedLocalDate: '2026-11-05', expiresAtUtc: '2026-11-06T12:00:00.000Z' }, now, '2026-11-05'), false);
  assert.equal(canUseReportsReward({ lastUsedLocalDate: '2026-11-05', expiresAtUtc: '2026-11-06T12:00:00.000Z' }, '2026-11-06T12:00:01.000Z', '2026-11-06'), true);
});
