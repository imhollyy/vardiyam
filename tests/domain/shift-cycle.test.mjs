import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createCustomShiftCycle,
  createFixedShiftCycle,
  createFourTwoCycle,
  createSixOneCycle,
  createTwoTwoTwoCycle,
  createWeeklyThreeShiftCycle,
  cycleEntryLabel,
  dayOrdinal,
  euclideanModulo,
  getNominalShiftWindow,
  getProjectedDay,
  getProjectedRange,
  getProjectedRangeDayCount,
  MAX_PROJECTED_RANGE_DAYS,
  validatePlanOverrides,
  validateShiftCycle,
} from '../../src/domain/shift-cycle/index.ts';

const fixtureUrl = new URL('../fixtures/shift-cycle-cases.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));
const templates = Object.entries(fixture.templates).map(([code, window]) => ({
  id: code,
  code,
  name: code,
  startLocalTime: window.startLocalTime,
  endLocalTime: window.endLocalTime,
}));

function fixtureEntry(entry) {
  return entry === 'OFF' ? { kind: 'OFF' } : { kind: 'SHIFT', templateId: entry };
}

function fixtureCycle(cycleId) {
  const definition = fixture.cycles[cycleId];
  return {
    id: cycleId,
    name: cycleId,
    timezone: definition.timezone,
    anchorLocalDate: definition.anchorLocalDate,
    startIndex: definition.startIndex,
    entries: definition.entries.map(fixtureEntry),
  };
}

function fixtureOverride(override) {
  return override.kind === 'SHIFT'
    ? { ...override, templateId: override.templateId }
    : override;
}

function expectedError(action, expectedCode) {
  assert.throws(action, (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

for (const scenario of fixture.projectionCases) {
  test(scenario.id + ' projects its synthetic cycle date', () => {
    const projected = getProjectedDay(
      fixtureCycle(scenario.cycleId),
      templates,
      scenario.targetLocalDate,
    );

    assert.equal(projected.cycleIndex, scenario.expected.cycleIndex);
    assert.equal(cycleEntryLabel(projected, templates), scenario.expected.entry);
    assert.equal(projected.source, 'CYCLE');
  });
}

for (const scenario of fixture.overrideCases) {
  test(scenario.id + ' applies only its matching synthetic date override', () => {
    const projected = getProjectedDay(
      fixtureCycle(scenario.cycleId),
      templates,
      scenario.targetLocalDate,
      scenario.overrides.map(fixtureOverride),
    );

    assert.equal(projected.cycleIndex, scenario.expected.cycleIndex);
    assert.equal(cycleEntryLabel(projected, templates), scenario.expected.entry);
    assert.equal(projected.source, scenario.expected.source);
  });
}

for (const scenario of fixture.timeWindowCases) {
  test(scenario.id + ' resolves a nominal local shift window', () => {
    const window = getNominalShiftWindow(
      scenario.startDate,
      scenario.startLocalTime,
      scenario.endLocalTime,
    );

    assert.equal(window.endDate, scenario.expected.endDate);
    assert.equal(window.crossesMidnight, scenario.expected.crossesMidnight);
    assert.equal(window.nominalMinutes, scenario.expected.nominalMinutes);
  });
}

for (const scenario of fixture.invalidCases) {
  test(scenario.id + ' rejects ' + scenario.description, () => {
    const cycle = fixtureCycle('two_two_two');
    const value = scenario.value;
    const actionById = {
      E01: () => validateShiftCycle({ ...cycle, entries: [] }, templates),
      E02: () => validateShiftCycle({ ...cycle, entries: value.entries.map(fixtureEntry), startIndex: value.startIndex }, templates),
      E03: () => validateShiftCycle({ ...cycle, entries: value.entries.map(fixtureEntry), startIndex: value.startIndex }, templates),
      E04: () => dayOrdinal(value.localDate),
      E05: () => dayOrdinal(value.localDate),
      E06: () => dayOrdinal(value.localDate),
      E07: () => dayOrdinal(value.localDate),
      E08: () =>
        validateShiftCycle(
          { ...cycle, entries: value.entries.map(fixtureEntry) },
          templates,
        ),
      E09: () =>
        validatePlanOverrides(
          value.overrides.map(fixtureOverride),
          templates,
        ),
      E10: () =>
        getNominalShiftWindow(
          '2026-11-05',
          value.startLocalTime,
          value.endLocalTime,
        ),
      E11: () =>
        getNominalShiftWindow(
          '2026-11-05',
          value.startLocalTime,
          value.endLocalTime,
        ),
    };

    expectedError(actionById[scenario.id], scenario.expectedError);
  });
}

test('preset constructors create fixed, weekly-three, 2+2+2, 4+2, and 6+1 entry sequences', () => {
  const config = {
    id: 'preset',
    name: 'Preset',
    timezone: 'Europe/Istanbul',
    anchorLocalDate: '2026-11-05',
    startIndex: 0,
  };

  assert.deepEqual(createFixedShiftCycle(config, 'S').entries, [{ kind: 'SHIFT', templateId: 'S' }]);
  assert.equal(createWeeklyThreeShiftCycle(config, ['S', 'A', 'G']).entries.length, 21);
  assert.deepEqual(createTwoTwoTwoCycle(config, ['S', 'A', 'G']).entries, [
    { kind: 'SHIFT', templateId: 'S' },
    { kind: 'SHIFT', templateId: 'S' },
    { kind: 'SHIFT', templateId: 'A' },
    { kind: 'SHIFT', templateId: 'A' },
    { kind: 'SHIFT', templateId: 'G' },
    { kind: 'SHIFT', templateId: 'G' },
  ]);
  assert.deepEqual(
    createFourTwoCycle(config, 'S').entries.slice(-2),
    [{ kind: 'OFF' }, { kind: 'OFF' }],
  );
  assert.deepEqual(
    createSixOneCycle(config, 'S').entries.slice(-1),
    [{ kind: 'OFF' }],
  );
  assert.deepEqual(
    createCustomShiftCycle(config, [{ kind: 'SHIFT', templateId: 'G' }, { kind: 'OFF' }]).entries,
    [{ kind: 'SHIFT', templateId: 'G' }, { kind: 'OFF' }],
  );
});

test('range projection stays aligned after more than 180 local calendar days', () => {
  const cycle = fixtureCycle('two_two_two');
  const range = getProjectedRange(
    cycle,
    templates,
    '2026-11-05',
    '2027-05-05',
  );

  assert.equal(dayOrdinal('2027-05-04') - dayOrdinal('2026-11-05'), 180);
  assert.equal(range.length, 182);
  assert.equal(range[180].localDate, '2027-05-04');
  assert.equal(range[180].cycleIndex, 0);
  assert.equal(range[181].localDate, '2027-05-05');
  assert.equal(range[181].cycleIndex, 1);
  assert.deepEqual(
    range[181],
    getProjectedDay(cycle, templates, '2027-05-05'),
  );
});

test('negative dates and Euclidean modulo retain the configured start index', () => {
  const cycle = fixtureCycle('custom_offset');

  assert.equal(euclideanModulo(-1, 3), 2);
  assert.equal(
    getProjectedDay(cycle, templates, '2026-11-04').cycleIndex,
    0,
  );
  assert.equal(
    getProjectedDay(cycle, templates, '2026-11-05').cycleIndex,
    1,
  );
});

test('override changes one projected date and does not shift later cycle days', () => {
  const cycle = fixtureCycle('two_two_two');
  const overrides = [{ localDate: '2026-11-06', kind: 'OFF' }];

  assert.equal(
    getProjectedDay(cycle, templates, '2026-11-06', overrides).kind,
    'OFF',
  );
  assert.equal(
    getProjectedDay(cycle, templates, '2026-11-07', overrides).templateId,
    'A',
  );
  assert.equal(
    getProjectedDay(cycle, templates, '2026-11-07').templateId,
    'A',
  );
});

test('timezone metadata changes do not change local-date cycle indices', () => {
  const base = fixtureCycle('two_two_two');
  const date = '2027-03-28';
  const expected = getProjectedDay(base, templates, date).cycleIndex;

  for (const timezone of ['UTC', 'America/Los_Angeles', 'Europe/Istanbul']) {
    const projected = getProjectedDay({ ...base, timezone }, templates, date);
    assert.equal(projected.cycleIndex, expected);
    assert.equal(projected.localDate, date);
  }
});

test('host timezone changes do not affect proleptic Gregorian day arithmetic', () => {
  const originalTimezone = process.env.TZ;

  try {
    for (const timezone of ['UTC', 'Pacific/Apia', 'America/New_York']) {
      process.env.TZ = timezone;
      assert.equal(
        dayOrdinal('2028-03-01') - dayOrdinal('2028-02-28'),
        2,
      );
      assert.equal(
        getProjectedDay(fixtureCycle('two_two_two'), templates, '2028-03-01').cycleIndex,
        euclideanModulo(
          fixtureCycle('two_two_two').startIndex +
            dayOrdinal('2028-03-01') -
            dayOrdinal(fixtureCycle('two_two_two').anchorLocalDate),
          fixtureCycle('two_two_two').entries.length,
        ),
      );
    }
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }
});

test('OFF is returned as a plan entry and never relabeled as legal rest', () => {
  const planned = getProjectedDay(
    fixtureCycle('four_two'),
    templates,
    '2026-11-09',
  );

  assert.equal(planned.kind, 'OFF');
  assert.equal(cycleEntryLabel(planned, templates), 'OFF');
  assert.equal('workRecord' in planned, false);
  assert.equal('templateId' in planned, false);
});

test('range and template validation reject ambiguous or reversed inputs', () => {
  expectedError(
    () =>
      getProjectedRange(
        fixtureCycle('two_two_two'),
        templates,
        '2026-11-10',
        '2026-11-09',
      ),
    'INVALID_DATE_RANGE',
  );
  expectedError(
    () =>
      getProjectedDay(
        { ...fixtureCycle('two_two_two'), timezone: 'Not/A_Timezone' },
        templates,
        '2026-11-05',
      ),
    'INVALID_TIMEZONE',
  );
  expectedError(
    () =>
      validateShiftCycle(
        fixtureCycle('two_two_two'),
        [...templates, { ...templates[0] }],
      ),
    'DUPLICATE_TEMPLATE',
  );
});


test('Gregorian ordinal handles year zero and years below 100 without Date.UTC quirks', () => {
  const acrossLeapDay = getProjectedRange(
    fixtureCycle('two_two_two'),
    templates,
    '0000-02-28',
    '0000-03-01',
  );
  const acrossYear = getProjectedRange(
    fixtureCycle('two_two_two'),
    templates,
    '0099-12-31',
    '0100-01-01',
  );

  assert.equal(acrossLeapDay.length, 3);
  assert.equal(acrossLeapDay[1].localDate, '0000-02-29');
  assert.equal(acrossLeapDay[2].localDate, '0000-03-01');
  assert.equal(acrossYear.length, 2);
  assert.equal(acrossYear[1].localDate, '0100-01-01');
});

test('projection refuses excessively large output arrays before allocation', () => {
  assert.equal(MAX_PROJECTED_RANGE_DAYS, 3660);
  assert.equal(getProjectedRangeDayCount('2026-01-01', '2026-01-01'), 1);
  expectedError(
    () => getProjectedRangeDayCount('2026-01-01', '2037-01-01'),
    'RANGE_TOO_LARGE',
  );
  expectedError(
    () => getProjectedRange(fixtureCycle('two_two_two'), templates, '2026-01-01', '2037-01-01'),
    'RANGE_TOO_LARGE',
  );
});
