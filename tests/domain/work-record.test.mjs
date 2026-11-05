import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRecordRangeDifferenceMinutes,
  getLocalDateTimeCandidates,
  localDateTimeToUtc,
  utcToLocalDateTime,
  validateWorkRecord,
  WorkRecordError,
} from '../../src/domain/work-record.ts';

function record(overrides = {}) {
  return {
    id: 'synthetic', source: 'MANUAL',
    startedAtUtc: '2026-01-01T05:00:00.000Z', endedAtUtc: '2026-01-01T13:00:00.000Z',
    timezone: 'Europe/Istanbul', breakMinutes: 0, note: null, planned: null,
    ...overrides,
  };
}

test('IANA local date/time converts to canonical UTC and round-trips in the same zone', () => {
  const instant = localDateTimeToUtc('2026-01-01T08:00', 'Europe/Istanbul');
  assert.equal(instant, '2026-01-01T05:00:00.000Z');
  assert.equal(utcToLocalDateTime(instant, 'Europe/Istanbul'), '2026-01-01T08:00');
});

test('overnight work records preserve the next local date across month and year boundary', () => {
  const start = localDateTimeToUtc('2026-12-31T23:00', 'Europe/Istanbul');
  const end = localDateTimeToUtc('2027-01-01T07:00', 'Europe/Istanbul');
  assert.equal(start, '2026-12-31T20:00:00.000Z');
  assert.equal(end, '2027-01-01T04:00:00.000Z');
  assert.equal(utcToLocalDateTime(end, 'Europe/Istanbul'), '2027-01-01T07:00');
  assert.doesNotThrow(() => validateWorkRecord(record({ startedAtUtc: start, endedAtUtc: end })));
});

test('nonexistent and ambiguous daylight-saving local times are rejected explicitly', () => {
  assert.throws(
    () => localDateTimeToUtc('2026-03-08T02:30', 'America/New_York'),
    (error) => error instanceof WorkRecordError && error.code === 'NONEXISTENT_LOCAL_TIME',
  );
  assert.throws(
    () => localDateTimeToUtc('2026-11-01T01:30', 'America/New_York'),
    (error) => error instanceof WorkRecordError && error.code === 'AMBIGUOUS_LOCAL_TIME',
  );
  const repeated = getLocalDateTimeCandidates('2026-11-01T01:30', 'America/New_York');
  assert.deepEqual(repeated, ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  assert.equal(localDateTimeToUtc('2026-11-01T01:30', 'America/New_York', 'earlier'), repeated[0]);
  assert.equal(localDateTimeToUtc('2026-11-01T01:30', 'America/New_York', 'later'), repeated[1]);
});

test('invalid date, wall time, and timezone are rejected', () => {
  assert.throws(() => localDateTimeToUtc('2026-02-29T08:00', 'Europe/Istanbul'));
  assert.throws(() => localDateTimeToUtc('2026-01-01T24:00', 'Europe/Istanbul'));
  assert.throws(
    () => localDateTimeToUtc('2026-01-01T08:00', 'Not/A_Zone'),
    (error) => error instanceof WorkRecordError && error.code === 'INVALID_TIMEZONE',
  );
});

test('work record instants must be canonical UTC minute values', () => {
  assert.throws(() => validateWorkRecord(record({ startedAtUtc: '2026-01-01T08:00:00+03:00' })), /UTC zamanı/);
  assert.throws(() => validateWorkRecord(record({ startedAtUtc: '2026-01-01T05:00:30.000Z' })), /UTC zamanı/);
  assert.throws(() => validateWorkRecord(record({ startedAtUtc: '2026-02-30T05:00:00.000Z' })), /Bitiş anı/);
  assert.throws(() => validateWorkRecord(record({ timezone: '' })), /IANA/);
});

test('reversed range and invalid break limits are rejected while exact range boundary is allowed', () => {
  assert.throws(() => validateWorkRecord(record({ endedAtUtc: '2025-12-31T23:00:00.000Z' })), /Bitiş anı/);
  assert.throws(() => validateWorkRecord(record({ breakMinutes: -1 })), /Mola/);
  assert.throws(() => validateWorkRecord(record({ breakMinutes: 481 })), /Mola/);
  assert.doesNotThrow(() => validateWorkRecord(record({ breakMinutes: 480 })));
});

test('planned time range difference is represented only as an integer duration delta', () => {
  const plannedRecord = record({
    source: 'PLANNED',
    startedAtUtc: '2026-01-01T05:00:00.000Z',
    endedAtUtc: '2026-01-01T14:00:00.000Z',
    planned: {
      cycleId: 'synthetic-cycle', localDate: '2026-01-01', templateId: 'synthetic-template',
      templateName: 'Synthetic day', startLocalDateTime: '2026-01-01T08:00', endLocalDateTime: '2026-01-01T16:00',
    },
  });
  assert.doesNotThrow(() => validateWorkRecord(plannedRecord));
  assert.equal(getRecordRangeDifferenceMinutes(plannedRecord), 60);
  assert.equal(getRecordRangeDifferenceMinutes(record()), null);
});

test('planned duration comparison uses real instants across daylight-saving transitions', () => {
  const plan = (startLocalDateTime, endLocalDateTime) => ({
    cycleId: 'synthetic-cycle', localDate: startLocalDateTime.slice(0, 10), templateId: 'synthetic-template',
    templateName: 'Synthetic shift', startLocalDateTime, endLocalDateTime,
  });
  const spring = record({
    source: 'PLANNED', timezone: 'America/New_York',
    startedAtUtc: '2026-03-08T05:00:00.000Z', endedAtUtc: '2026-03-08T12:00:00.000Z',
    planned: plan('2026-03-08T00:00', '2026-03-08T08:00'),
  });
  const fall = record({
    source: 'PLANNED', timezone: 'America/New_York',
    startedAtUtc: '2026-11-01T04:00:00.000Z', endedAtUtc: '2026-11-01T13:00:00.000Z',
    planned: plan('2026-11-01T00:00', '2026-11-01T08:00'),
  });
  const ambiguousPlanEndpoint = record({
    source: 'PLANNED', timezone: 'America/New_York',
    startedAtUtc: '2026-11-01T04:00:00.000Z', endedAtUtc: '2026-11-01T07:30:00.000Z',
    planned: plan('2026-11-01T00:00', '2026-11-01T01:30'),
  });
  assert.equal(getRecordRangeDifferenceMinutes(spring), 0);
  assert.equal(getRecordRangeDifferenceMinutes(fall), 0);
  assert.equal(getRecordRangeDifferenceMinutes(ambiguousPlanEndpoint), null);
});

test('planned snapshot date must match its local start date and end later', () => {
  const base = record({
    source: 'PLANNED',
    planned: {
      cycleId: 'cycle', localDate: '2026-01-01', templateId: 'day', templateName: 'Day',
      startLocalDateTime: '2026-01-02T08:00', endLocalDateTime: '2026-01-02T16:00',
    },
  });
  assert.throws(() => validateWorkRecord(base), /Plan başlangıç/);
});
