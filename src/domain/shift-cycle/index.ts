export type LocalDate = string;

export type ShiftTemplate = {
  id: string;
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  colorToken?: string;
  iconKey?: string;
};

export type CycleEntry = { kind: 'SHIFT'; templateId: string } | { kind: 'OFF' };

export type ShiftCycle = {
  id: string;
  name: string;
  timezone: string;
  anchorLocalDate: LocalDate;
  startIndex: number;
  entries: readonly CycleEntry[];
};

export type PlanOverride =
  | { localDate: LocalDate; kind: 'SHIFT'; templateId: string; reason?: string }
  | { localDate: LocalDate; kind: 'OFF' | 'LEAVE'; reason?: string };

export type PlannedShift = {
  localDate: LocalDate;
  source: 'CYCLE' | 'OVERRIDE';
  kind: 'SHIFT' | 'OFF' | 'LEAVE';
  templateId?: string;
  cycleId: string;
  cycleIndex: number;
  timezone: string;
};

export type ShiftCycleErrorCode =
  | 'INVALID_DATE'
  | 'INVALID_DATE_RANGE'
  | 'RANGE_TOO_LARGE'
  | 'EMPTY_CYCLE'
  | 'INVALID_START_INDEX'
  | 'INVALID_TIMEZONE'
  | 'INVALID_LOCAL_TIME'
  | 'AMBIGUOUS_DURATION'
  | 'UNKNOWN_TEMPLATE'
  | 'DUPLICATE_TEMPLATE'
  | 'INVALID_OVERRIDE'
  | 'DUPLICATE_OVERRIDE';

export class ShiftCycleError extends Error {
  readonly code: ShiftCycleErrorCode;

  constructor(code: ShiftCycleErrorCode, message: string) {
    super(message);
    this.name = 'ShiftCycleError';
    this.code = code;
  }
}

type DateParts = { year: number; month: number; day: number };

const DAYS_PER_400_YEARS = 146_097;
export const MAX_PROJECTED_RANGE_DAYS = 3_660;

function fail(code: ShiftCycleErrorCode, message: string): never {
  throw new ShiftCycleError(code, message);
}

function parseLocalDate(localDate: LocalDate): DateParts {
  if (typeof localDate !== 'string') {
    return fail('INVALID_DATE', 'Local date must be a YYYY-MM-DD string.');
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    return fail('INVALID_DATE', 'Local date must use the YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    return fail('INVALID_DATE', 'Local date is not a valid proleptic Gregorian date.');
  }

  return { year, month, day };
}

/** Returns an integer day ordinal without using host-local time or timezone offsets. */
export function dayOrdinal(localDate: LocalDate): number {
  const { year, month, day } = parseLocalDate(localDate);
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * DAYS_PER_400_YEARS + dayOfEra;
}

function localDateFromOrdinal(ordinal: number): LocalDate {
  const era = Math.floor(ordinal / DAYS_PER_400_YEARS);
  const dayOfEra = ordinal - era * DAYS_PER_400_YEARS;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;

  if (year < 0 || year > 9999) {
    return fail('INVALID_DATE', 'Date range exceeds the supported four-digit year format.');
  }

  return (
    String(year).padStart(4, '0') +
    '-' +
    String(month).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

export function addCalendarDays(localDate: LocalDate, days: number): LocalDate {
  if (!Number.isSafeInteger(days)) {
    return fail('INVALID_DATE', 'Calendar day offset must be a safe integer.');
  }

  return localDateFromOrdinal(dayOrdinal(localDate) + days);
}

export function euclideanModulo(value: number, modulus: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(modulus) || modulus <= 0) {
    return fail('INVALID_START_INDEX', 'Modulo inputs must be safe integers and modulus must be positive.');
  }

  return ((value % modulus) + modulus) % modulus;
}

function validateLocalTime(localTime: string): number {
  if (typeof localTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    return fail('INVALID_LOCAL_TIME', 'Local time must use the 24-hour HH:mm format.');
  }

  const [hours, minutes] = localTime.split(':').map(Number);
  return hours * 60 + minutes;
}

export type NominalShiftWindow = {
  startDate: LocalDate;
  endDate: LocalDate;
  startLocalTime: string;
  endLocalTime: string;
  crossesMidnight: boolean;
  nominalMinutes: number;
};

/** Resolves only the displayed local calendar window; it does not segment work or calculate pay. */
export function getNominalShiftWindow(
  startDate: LocalDate,
  startLocalTime: string,
  endLocalTime: string,
): NominalShiftWindow {
  dayOrdinal(startDate);
  const startMinute = validateLocalTime(startLocalTime);
  const endMinute = validateLocalTime(endLocalTime);

  if (startMinute === endMinute) {
    return fail('AMBIGUOUS_DURATION', 'Equal start and end times do not imply a 24-hour shift.');
  }

  const crossesMidnight = endMinute < startMinute;
  const nominalMinutes = (endMinute - startMinute + (crossesMidnight ? 1440 : 0));

  return {
    startDate,
    endDate: crossesMidnight ? addCalendarDays(startDate, 1) : startDate,
    startLocalTime,
    endLocalTime,
    crossesMidnight,
    nominalMinutes,
  };
}

export function validateShiftTemplate(template: ShiftTemplate): void {
  if (
    !template ||
    typeof template.id !== 'string' ||
    template.id.trim() === '' ||
    typeof template.code !== 'string' ||
    template.code.trim() === '' ||
    typeof template.name !== 'string' ||
    template.name.trim() === ''
  ) {
    return fail('UNKNOWN_TEMPLATE', 'Shift template id, code, and name must be non-empty strings.');
  }

  getNominalShiftWindow(
    '2000-01-01',
    template.startLocalTime,
    template.endLocalTime,
  );
}

function templateMap(templates: readonly ShiftTemplate[]): Map<string, ShiftTemplate> {
  const byId = new Map<string, ShiftTemplate>();
  const codes = new Set<string>();

  for (const template of templates) {
    validateShiftTemplate(template);
    if (byId.has(template.id) || codes.has(template.code)) {
      return fail('DUPLICATE_TEMPLATE', 'Shift template ids and codes must be unique.');
    }

    byId.set(template.id, template);
    codes.add(template.code);
  }

  return byId;
}

function validateTimezone(timezone: string): void {
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return fail('INVALID_TIMEZONE', 'Cycle timezone must be an IANA timezone identifier.');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return fail('INVALID_TIMEZONE', 'Cycle timezone must be a supported IANA timezone identifier.');
  }
}

export function validateShiftCycle(
  cycle: ShiftCycle,
  templates: readonly ShiftTemplate[],
): void {
  if (!cycle || !Array.isArray(cycle.entries) || cycle.entries.length === 0) {
    return fail('EMPTY_CYCLE', 'A shift cycle must contain at least one entry.');
  }

  if (
    !Number.isSafeInteger(cycle.startIndex) ||
    cycle.startIndex < 0 ||
    cycle.startIndex >= cycle.entries.length
  ) {
    return fail('INVALID_START_INDEX', 'Cycle startIndex must point to an existing entry.');
  }

  if (
    typeof cycle.id !== 'string' ||
    cycle.id.trim() === '' ||
    typeof cycle.name !== 'string' ||
    cycle.name.trim() === ''
  ) {
    return fail('EMPTY_CYCLE', 'Cycle id and name must be non-empty strings.');
  }

  dayOrdinal(cycle.anchorLocalDate);
  validateTimezone(cycle.timezone);
  const byId = templateMap(templates);

  for (const entry of cycle.entries) {
    if (entry && entry.kind === 'OFF') {
      continue;
    }

    if (!entry || entry.kind !== 'SHIFT' || !byId.has(entry.templateId)) {
      return fail('UNKNOWN_TEMPLATE', 'Every SHIFT cycle entry must reference a known template.');
    }
  }
}

function validateOneOverride(
  override: PlanOverride,
  byId: ReadonlyMap<string, ShiftTemplate>,
): void {
  if (!override || (override.kind !== 'SHIFT' && override.kind !== 'OFF' && override.kind !== 'LEAVE')) {
    return fail('INVALID_OVERRIDE', 'Override kind must be SHIFT, OFF, or LEAVE.');
  }

  dayOrdinal(override.localDate);

  if (override.kind === 'SHIFT') {
    if (!override.templateId || !byId.has(override.templateId)) {
      return fail('UNKNOWN_TEMPLATE', 'SHIFT override must reference a known template.');
    }
  } else if ('templateId' in override) {
    return fail('INVALID_OVERRIDE', 'OFF and LEAVE overrides cannot include a template id.');
  }
}

export function validatePlanOverrides(
  overrides: readonly PlanOverride[],
  templates: readonly ShiftTemplate[],
): void {
  const byId = templateMap(templates);
  const dates = new Set<string>();

  for (const override of overrides) {
    validateOneOverride(override, byId);
    if (dates.has(override.localDate)) {
      return fail('DUPLICATE_OVERRIDE', 'Only one active override is allowed per local date.');
    }

    dates.add(override.localDate);
  }
}

export function applyDayOverride(
  projectedDay: PlannedShift,
  override: PlanOverride,
  templates: readonly ShiftTemplate[],
): PlannedShift {
  const byId = templateMap(templates);
  validateOneOverride(override, byId);

  if (override.localDate !== projectedDay.localDate) {
    return projectedDay;
  }

  const result: PlannedShift = {
    ...projectedDay,
    source: 'OVERRIDE',
    kind: override.kind,
  };

  if (override.kind === 'SHIFT') {
    result.templateId = override.templateId;
  } else {
    delete result.templateId;
  }

  return result;
}

function projectValidatedDay(
  cycle: ShiftCycle,
  targetLocalDate: LocalDate,
  overridesByDate: ReadonlyMap<string, PlanOverride>,
  templates: readonly ShiftTemplate[],
): PlannedShift {
  const cycleIndex = euclideanModulo(
    cycle.startIndex + dayOrdinal(targetLocalDate) - dayOrdinal(cycle.anchorLocalDate),
    cycle.entries.length,
  );
  const entry = cycle.entries[cycleIndex];
  const base: PlannedShift =
    entry.kind === 'OFF'
      ? {
          localDate: targetLocalDate,
          source: 'CYCLE',
          kind: 'OFF',
          cycleId: cycle.id,
          cycleIndex,
          timezone: cycle.timezone,
        }
      : {
          localDate: targetLocalDate,
          source: 'CYCLE',
          kind: 'SHIFT',
          templateId: entry.templateId,
          cycleId: cycle.id,
          cycleIndex,
          timezone: cycle.timezone,
        };
  const override = overridesByDate.get(targetLocalDate);

  return override ? applyDayOverride(base, override, templates) : base;
}

function overridesByDate(
  overrides: readonly PlanOverride[],
  templates: readonly ShiftTemplate[],
): Map<string, PlanOverride> {
  validatePlanOverrides(overrides, templates);
  return new Map(overrides.map((override) => [override.localDate, override]));
}

export function getProjectedDay(
  cycle: ShiftCycle,
  templates: readonly ShiftTemplate[],
  targetLocalDate: LocalDate,
  overrides: readonly PlanOverride[] = [],
): PlannedShift {
  validateShiftCycle(cycle, templates);
  dayOrdinal(targetLocalDate);
  const byDate = overridesByDate(overrides, templates);

  return projectValidatedDay(cycle, targetLocalDate, byDate, templates);
}

/** Returns an inclusive range by applying the exact same projection used for a single date. */
export function getProjectedRangeDayCount(
  startLocalDate: LocalDate,
  endLocalDate: LocalDate,
): number {
  const firstDay = dayOrdinal(startLocalDate);
  const lastDay = dayOrdinal(endLocalDate);

  if (lastDay < firstDay) {
    return fail('INVALID_DATE_RANGE', 'Range end must not be before range start.');
  }

  const dayCount = lastDay - firstDay + 1;
  if (dayCount > MAX_PROJECTED_RANGE_DAYS) {
    return fail(
      'RANGE_TOO_LARGE',
      'Projection ranges are limited to ' + MAX_PROJECTED_RANGE_DAYS + ' local calendar days.',
    );
  }

  return dayCount;
}

export function getProjectedRange(
  cycle: ShiftCycle,
  templates: readonly ShiftTemplate[],
  startLocalDate: LocalDate,
  endLocalDate: LocalDate,
  overrides: readonly PlanOverride[] = [],
): PlannedShift[] {
  validateShiftCycle(cycle, templates);
  const dayCount = getProjectedRangeDayCount(startLocalDate, endLocalDate);
  const firstDay = dayOrdinal(startLocalDate);
  const byDate = overridesByDate(overrides, templates);
  const result: PlannedShift[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const ordinal = firstDay + offset;
    const localDate = localDateFromOrdinal(ordinal);
    result.push(projectValidatedDay(cycle, localDate, byDate, templates));
  }

  return result;
}

export type NewShiftCycle = Omit<ShiftCycle, 'entries'>;

function shift(templateId: string): CycleEntry {
  return { kind: 'SHIFT', templateId };
}

function off(): CycleEntry {
  return { kind: 'OFF' };
}

export function createFixedShiftCycle(
  cycle: NewShiftCycle,
  templateId: string,
): ShiftCycle {
  return { ...cycle, entries: [shift(templateId)] };
}

export function createWeeklyThreeShiftCycle(
  cycle: NewShiftCycle,
  shiftTemplateIds: readonly [string, string, string],
): ShiftCycle {
  return {
    ...cycle,
    entries: [
      ...Array.from({ length: 7 }, () => shift(shiftTemplateIds[0])),
      ...Array.from({ length: 7 }, () => shift(shiftTemplateIds[1])),
      ...Array.from({ length: 7 }, () => shift(shiftTemplateIds[2])),
    ],
  };
}

export function createTwoTwoTwoCycle(
  cycle: NewShiftCycle,
  shiftTemplateIds: readonly [string, string, string],
): ShiftCycle {
  return {
    ...cycle,
    entries: shiftTemplateIds.flatMap((templateId) => [shift(templateId), shift(templateId)]),
  };
}

export function createFourTwoCycle(
  cycle: NewShiftCycle,
  templateId: string,
): ShiftCycle {
  return {
    ...cycle,
    entries: [...Array.from({ length: 4 }, () => shift(templateId)), off(), off()],
  };
}

export function createSixOneCycle(
  cycle: NewShiftCycle,
  templateId: string,
): ShiftCycle {
  return {
    ...cycle,
    entries: [...Array.from({ length: 6 }, () => shift(templateId)), off()],
  };
}

export function createCustomShiftCycle(
  cycle: NewShiftCycle,
  entries: readonly CycleEntry[],
): ShiftCycle {
  return { ...cycle, entries: [...entries] };
}

export function cycleEntryLabel(
  entry: CycleEntry | PlannedShift,
  templates: readonly ShiftTemplate[],
): string {
  if (entry.kind === 'OFF') {
    return 'OFF';
  }

  if (entry.kind === 'LEAVE') {
    return 'LEAVE';
  }

  const templateId = entry.templateId;
  const template = templates.find((candidate) => candidate.id === templateId);

  if (!template) {
    return fail('UNKNOWN_TEMPLATE', 'Cannot label a shift with an unknown template.');
  }

  return template.code;
}
