import assert from 'node:assert/strict';
import test from 'node:test';

import { segmentWorkRecord, WorkSegmentationError } from '../../src/domain/work-segmentation.ts';

const work = (start, end, overrides = {}) => ({
  startedAtUtc: start,
  endedAtUtc: end,
  timezone: 'Europe/Istanbul',
  breakMinutes: 0,
  ...overrides,
});

const options = (overrides = {}) => ({ weekStartsOn: 1, payrollPeriodStartDay: 15, ...overrides });

test('ordinary shift subtracts a known break and preserves total-minute invariants', () => {
  const result = segmentWorkRecord(work('2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z', {
    breakMinutes: 30,
  }), options({ breakIntervals: [{ startedAtUtc: '2026-01-05T09:00:00.000Z', endedAtUtc: '2026-01-05T09:30:00.000Z' }] }));

  assert.deepEqual(result.segments.map(({ startedAtUtc, endedAtUtc, spanMinutes, workedMinutes }) => [startedAtUtc, endedAtUtc, spanMinutes, workedMinutes]), [
    ['2026-01-05T05:00:00.000Z', '2026-01-05T09:00:00.000Z', 240, 240],
    ['2026-01-05T09:30:00.000Z', '2026-01-05T13:00:00.000Z', 210, 210],
  ]);
  assert.equal(result.totalSpanMinutes, 480);
  assert.equal(result.totalBreakMinutes, 30);
  assert.equal(result.totalWorkedMinutes, 450);
  assert.equal(result.breakTiming, 'TIMED');
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.workedMinutes, 0), result.totalWorkedMinutes);
});

test('overnight record splits at local midnight but aggregate-only break never gets guessed into a side', () => {
  const result = segmentWorkRecord(work('2026-01-01T19:00:00.000Z', '2026-01-02T03:00:00.000Z', {
    breakMinutes: 30,
  }), options());

  assert.deepEqual(result.segments.map(({ localDate, spanMinutes, workedMinutes }) => [localDate, spanMinutes, workedMinutes]), [
    ['2026-01-01', 120, null],
    ['2026-01-02', 360, null],
  ]);
  assert.equal(result.totalSpanMinutes, 480);
  assert.equal(result.totalWorkedMinutes, 450);
  assert.equal(result.breakTiming, 'AGGREGATE_ONLY');
  assert.equal(result.unallocatedBreakMinutes, 30);
});

test('October 28 half-day parameter creates an exact 13:00 local boundary without assigning legal meaning', () => {
  const result = segmentWorkRecord(work('2026-10-28T07:00:00.000Z', '2026-10-28T15:00:00.000Z'), options({
    boundaryWindows: [{
      id: 'synthetic-half-day', kind: 'HALF_DAY_HOLIDAY',
      startsAtUtc: '2026-10-28T10:00:00.000Z', endedAtUtc: '2026-10-28T15:00:00.000Z',
    }],
  }));

  assert.deepEqual(result.segments.map(({ startedAtUtc, endedAtUtc, spanMinutes, boundaryIds }) => [startedAtUtc, endedAtUtc, spanMinutes, boundaryIds]), [
    ['2026-10-28T07:00:00.000Z', '2026-10-28T10:00:00.000Z', 180, []],
    ['2026-10-28T10:00:00.000Z', '2026-10-28T15:00:00.000Z', 300, ['synthetic-half-day']],
  ]);
});

test('year and month rollover splits 31 December overnight work by actual local dates', () => {
  const result = segmentWorkRecord(work('2026-12-31T19:00:00.000Z', '2027-01-01T03:00:00.000Z'), options());
  assert.deepEqual(result.segments.map(({ localDate, calendarMonth, calendarYear, spanMinutes }) => [localDate, calendarMonth, calendarYear, spanMinutes]), [
    ['2026-12-31', '2026-12', 2026, 120],
    ['2027-01-01', '2027-01', 2027, 360],
  ]);
});

test('week boundary follows the configured Monday start, independent of weekend labels', () => {
  const result = segmentWorkRecord(work('2026-12-06T20:00:00.000Z', '2026-12-07T05:00:00.000Z'), options());
  assert.deepEqual(result.segments.map(({ localDate, weekStartLocalDate, spanMinutes }) => [localDate, weekStartLocalDate, spanMinutes]), [
    ['2026-12-06', '2026-11-30', 60],
    ['2026-12-07', '2026-12-07', 480],
  ]);
  assert.ok(result.segments.every((segment) => !('legalRest' in segment)));
});

test('configurable payroll period starting on the 15th changes at local midnight', () => {
  const result = segmentWorkRecord(work('2026-01-14T19:00:00.000Z', '2026-01-15T03:00:00.000Z'), options());
  assert.deepEqual(result.segments.map(({ localDate, payrollPeriodStartDate, spanMinutes }) => [localDate, payrollPeriodStartDate, spanMinutes]), [
    ['2026-01-14', '2025-12-15', 120],
    ['2026-01-15', '2026-01-15', 360],
  ]);
});

test('DST spring and fall transitions use elapsed UTC minutes and IANA local calendar dates', () => {
  const spring = segmentWorkRecord(work('2026-03-08T05:00:00.000Z', '2026-03-08T12:00:00.000Z', {
    timezone: 'America/New_York',
  }), options());
  const fall = segmentWorkRecord(work('2026-11-01T04:00:00.000Z', '2026-11-01T13:00:00.000Z', {
    timezone: 'America/New_York',
  }), options());

  assert.deepEqual([spring.totalSpanMinutes, spring.segments.length, spring.segments[0].localDate], [420, 1, '2026-03-08']);
  assert.deepEqual([fall.totalSpanMinutes, fall.segments.length, fall.segments[0].localDate], [540, 1, '2026-11-01']);

  const midnightGap = segmentWorkRecord(work('2018-11-04T02:00:00.000Z', '2018-11-04T05:00:00.000Z', {
    timezone: 'America/Sao_Paulo',
  }), options());
  assert.deepEqual(midnightGap.segments.map(({ localDate, spanMinutes }) => [localDate, spanMinutes]), [
    ['2018-11-03', 60],
    ['2018-11-04', 120],
  ]);
});

test('overlapping break intervals are rejected while adjacent breaks are allowed', () => {
  const record = work('2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z', { breakMinutes: 30 });
  assert.throws(() => segmentWorkRecord(record, options({ breakIntervals: [
    { startedAtUtc: '2026-01-05T08:00:00.000Z', endedAtUtc: '2026-01-05T08:20:00.000Z' },
    { startedAtUtc: '2026-01-05T08:19:00.000Z', endedAtUtc: '2026-01-05T08:29:00.000Z' },
  ] })), (error) => error instanceof WorkSegmentationError && error.code === 'OVERLAPPING_BREAKS');

  const adjacent = segmentWorkRecord(record, options({ breakIntervals: [
    { startedAtUtc: '2026-01-05T08:00:00.000Z', endedAtUtc: '2026-01-05T08:15:00.000Z' },
    { startedAtUtc: '2026-01-05T08:15:00.000Z', endedAtUtc: '2026-01-05T08:30:00.000Z' },
  ] }));
  assert.equal(adjacent.totalBreakMinutes, 30);
  assert.equal(adjacent.totalWorkedMinutes, 450);
});

test('overlapping boundary windows partition time once and attach all active input markers', () => {
  const result = segmentWorkRecord(work('2026-01-05T05:00:00.000Z', '2026-01-05T15:00:00.000Z'), options({
    boundaryWindows: [
      { id: 'holiday', kind: 'PUBLIC_HOLIDAY', startsAtUtc: '2026-01-05T08:00:00.000Z', endedAtUtc: '2026-01-05T12:00:00.000Z' },
      { id: 'rule-v2', kind: 'WORKPLACE_RULE_CHANGE', startsAtUtc: '2026-01-05T10:00:00.000Z', endedAtUtc: '2026-01-05T14:00:00.000Z' },
    ],
  }));
  assert.deepEqual(result.segments.map(({ spanMinutes, boundaryIds }) => [spanMinutes, boundaryIds]), [
    [180, []], [120, ['holiday']], [120, ['holiday', 'rule-v2']], [120, ['rule-v2']], [60, []],
  ]);
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.spanMinutes, 0), 600);
  assert.equal(result.totalSpanMinutes, 600);
});

test('explicit break duration must match WorkRecord total; unknown breaks retain only aggregate net total', () => {
  const base = work('2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z', { breakMinutes: 30 });
  assert.throws(() => segmentWorkRecord(base, options({ breakIntervals: [
    { startedAtUtc: '2026-01-05T08:00:00.000Z', endedAtUtc: '2026-01-05T08:20:00.000Z' },
  ] })), (error) => error instanceof WorkSegmentationError && error.code === 'BREAK_TOTAL_MISMATCH');

  const unknown = segmentWorkRecord(base, options());
  assert.equal(unknown.totalWorkedMinutes, 450);
  assert.equal(unknown.breakTiming, 'AGGREGATE_ONLY');
  assert.equal(unknown.unallocatedBreakMinutes, 30);
  assert.equal(unknown.segments.length, 1);
  assert.equal(unknown.segments[0].workedMinutes, null);
});

test('invalid instants, unsupported zones, invalid period settings and non-positive ranges are rejected', () => {
  assert.throws(() => segmentWorkRecord(work('2026-01-05T05:00:30.000Z', '2026-01-05T13:00:00.000Z'), options()), WorkSegmentationError);
  assert.throws(() => segmentWorkRecord(work('2026-01-05T05:00:00.000Z', '2026-01-05T05:00:00.000Z'), options()), WorkSegmentationError);
  assert.throws(() => segmentWorkRecord(work('2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z', { timezone: 'No/Zone' }), options()), WorkSegmentationError);
  assert.throws(() => segmentWorkRecord(work('2026-01-05T05:00:00.000Z', '2026-01-05T13:00:00.000Z'), options({ payrollPeriodStartDay: 0 })), WorkSegmentationError);
});
