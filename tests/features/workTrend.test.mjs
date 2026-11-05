import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkTrend } from '../../src/features/reports/workTrend.ts';

test('work trend splits known work at local midnight and removes timed breaks', () => {
  const buckets = buildWorkTrend([{ record: { startedAtUtc: '2026-01-04T20:00:00.000Z', endedAtUtc: '2026-01-05T04:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 60 }, timedBreaks: [{ startedAtUtc: '2026-01-05T00:00:00.000Z', endedAtUtc: '2026-01-05T01:00:00.000Z' }] }], '2026-01-05', '2026-01-12', 'week');
  assert.equal(buckets[0]?.workedMinutes, 360);
  assert.equal(buckets[0]?.uncertainRecords, 0);
});

test('work trend preserves unknown aggregate-break allocation as uncertain', () => {
  const buckets = buildWorkTrend([{ record: { startedAtUtc: '2026-01-05T06:00:00.000Z', endedAtUtc: '2026-01-05T14:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 30 }, timedBreaks: [] }], '2026-01-05', '2026-01-12', 'week');
  assert.equal(buckets[0]?.workedMinutes, 0);
  assert.equal(buckets[0]?.uncertainRecords, 1);
});

test('work trend identifies known minutes as partial when the same period also has uncertain time', () => {
  const buckets = buildWorkTrend([
    { record: { startedAtUtc: '2026-01-05T06:00:00.000Z', endedAtUtc: '2026-01-05T08:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 0 }, timedBreaks: [] },
    { record: { startedAtUtc: '2026-01-05T08:00:00.000Z', endedAtUtc: '2026-01-05T10:00:00.000Z', timezone: 'Europe/Istanbul', breakMinutes: 30 }, timedBreaks: [] },
  ], '2026-01-05', '2026-01-12', 'week');
  assert.equal(buckets[0]?.workedMinutes, 120);
  assert.equal(buckets[0]?.uncertainRecords, 1);
});
