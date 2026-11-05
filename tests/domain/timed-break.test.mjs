import assert from 'node:assert/strict';
import test from 'node:test';

import { localDateTimeToUtc } from '../../src/domain/work-record.ts';
import {
  resetTimedBreakOccurrences,
  TimedBreakError,
  validateTimedBreakIntervals,
} from '../../src/domain/timed-break.ts';

const record = (overrides = {}) => ({
  id: 'synthetic-work',
  source: 'MANUAL',
  startedAtUtc: '2026-10-28T07:00:00.000Z',
  endedAtUtc: '2026-10-28T15:00:00.000Z',
  timezone: 'Europe/Istanbul',
  breakMinutes: 30,
  note: null,
  planned: null,
  ...overrides,
});

test('timed breaks may cross local midnight while UTC duration remains exact', () => {
  const overnight = record({
    startedAtUtc: '2026-10-28T19:00:00.000Z',
    endedAtUtc: '2026-10-29T03:00:00.000Z',
    breakMinutes: 20,
  });
  assert.doesNotThrow(() => validateTimedBreakIntervals(overnight, [{
    id: 'midnight-break',
    startedAtUtc: '2026-10-28T20:50:00.000Z',
    endedAtUtc: '2026-10-28T21:10:00.000Z',
  }]));
});

test('local 28 October 13:00 boundary is retained exactly in UTC', () => {
  const start = localDateTimeToUtc('2026-10-28T12:45', 'Europe/Istanbul');
  const end = localDateTimeToUtc('2026-10-28T13:15', 'Europe/Istanbul');
  const interval = { id: 'half-day-break', startedAtUtc: start, endedAtUtc: end };
  validateTimedBreakIntervals(record(), [interval]);
  assert.deepEqual(interval, {
    id: 'half-day-break',
    startedAtUtc: '2026-10-28T09:45:00.000Z',
    endedAtUtc: '2026-10-28T10:15:00.000Z',
  });
});

test('DST fold requires explicit occurrence and nonexistent local break time is rejected', () => {
  const zone = 'America/New_York';
  assert.throws(() => localDateTimeToUtc('2026-11-01T01:15', zone), /iki kez|oluşum/i);
  assert.throws(() => localDateTimeToUtc('2026-03-08T02:15', zone), /yaz saati geçişi/i);
  const first = localDateTimeToUtc('2026-11-01T01:10', zone, 'earlier');
  const end = localDateTimeToUtc('2026-11-01T01:40', zone, 'earlier');
  assert.deepEqual([first, end], ['2026-11-01T05:10:00.000Z', '2026-11-01T05:40:00.000Z']);
  assert.doesNotThrow(() => validateTimedBreakIntervals(record({
    startedAtUtc: '2026-11-01T04:00:00.000Z',
    endedAtUtc: '2026-11-01T08:00:00.000Z',
    timezone: zone,
  }), [{ id: 'fold-break', startedAtUtc: first, endedAtUtc: end }]));
});

test('changing a timezone clears stale earlier/later fold choices for every break draft', () => {
  const before = [
    { id: 'first', startOccurrence: 'earlier', endOccurrence: 'later', startTime: '01:10', endTime: '01:40' },
    { id: 'second', startOccurrence: null, endOccurrence: 'earlier', startTime: '02:10', endTime: '02:20' },
  ];
  assert.deepEqual(resetTimedBreakOccurrences(before), [
    { id: 'first', startOccurrence: null, endOccurrence: null, startTime: '01:10', endTime: '01:40' },
    { id: 'second', startOccurrence: null, endOccurrence: null, startTime: '02:10', endTime: '02:20' },
  ]);
});

test('invalid UTC instants, overlap, out-of-range and mismatch are explicit validation errors', () => {
  const base = record({
    startedAtUtc: '2026-01-01T05:00:00.000Z',
    endedAtUtc: '2026-01-01T13:00:00.000Z',
    breakMinutes: 30,
  });
  const invalid = [
    [{ id: 'bad', startedAtUtc: '2026-02-30T08:00:00.000Z', endedAtUtc: '2026-02-30T08:30:00.000Z' }, 'INVALID_BREAK_INSTANT'],
    [{ id: 'outside', startedAtUtc: '2026-01-01T04:30:00.000Z', endedAtUtc: '2026-01-01T05:00:00.000Z' }, 'BREAK_OUTSIDE_RECORD'],
    [{ id: 'short', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:29:00.000Z' }, 'BREAK_TOTAL_MISMATCH'],
  ];
  for (const [interval, code] of invalid) {
    assert.throws(() => validateTimedBreakIntervals(base, [interval]), (error) => error instanceof TimedBreakError && error.code === code);
  }
  assert.throws(() => validateTimedBreakIntervals(base, [
    { id: 'a', startedAtUtc: '2026-01-01T08:00:00.000Z', endedAtUtc: '2026-01-01T08:20:00.000Z' },
    { id: 'b', startedAtUtc: '2026-01-01T08:19:00.000Z', endedAtUtc: '2026-01-01T08:29:00.000Z' },
  ]), (error) => error instanceof TimedBreakError && error.code === 'OVERLAPPING_BREAKS');
});
