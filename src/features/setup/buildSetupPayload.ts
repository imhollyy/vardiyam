import { parseTryMinor } from '../../domain/money.ts';
import { getPayPeriodForDate } from '../../domain/payroll/index.ts';
import { shiftNominalMinutes } from '../../config/shifts.ts';
import type { SalaryType, WorkSchedule, ShiftPattern } from '../../domain/payroll/types.ts';
import type { ShiftTemplate, CycleEntry, ShiftCycle } from '../../domain/shift-cycle/index.ts';
import { shiftKindOf } from '../../domain/shift-cycle/shiftKind.ts';

export type SetupTemplateDraft = {
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  breakMinutes: number;
};

export type SetupDraft = {
  salaryText: string;
  salaryType: SalaryType;
  payday: string;
  besEnabled: boolean;
  besRateBp: string;
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  templateDrafts: SetupTemplateDraft[];
  currentShiftIndex: number;
  startDate: string;
};

export type SetupSavePayload = {
  salaryMinor: number;
  salaryType: SalaryType;
  payday: string;
  besEnabled: boolean;
  besRateBp: number;
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  startDate: string | null;
  templates: ShiftTemplate[];
  cycle: ShiftCycle;
  effectiveFrom: string;
};

export function parseSetupStartDate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]!.padStart(2, '0')}-${parts[0]!.padStart(2, '0')}`;
}

export function mondayOfLocalDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  date.setDate(d + (dow === 0 ? -6 : 1 - dow));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function needsCurrentShiftStep(pattern: ShiftPattern): boolean {
  return pattern === 'TWO_SHIFT' || pattern === 'THREE_SHIFT';
}

export function buildCycleEntries(ws: WorkSchedule, sp: ShiftPattern, templateIds: string[]): CycleEntry[] {
  const workDays = ws === 'MON_FRI' ? 5 : ws === 'MON_SAT' ? 6 : 7;
  const offDays = 7 - workDays;
  const shift = (id: string): CycleEntry => ({ kind: 'SHIFT', templateId: id });
  const off = (): CycleEntry => ({ kind: 'OFF' });

  if (sp === 'FIXED_DAY' || sp === 'FIXED_NIGHT') {
    if (offDays === 0) return [shift(templateIds[0]!)];
    return [
      ...Array.from({ length: workDays }, () => shift(templateIds[0]!)),
      ...Array.from({ length: offDays }, () => off()),
    ];
  }

  const count = sp === 'TWO_SHIFT' ? 2 : 3;
  const entries: CycleEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offDays === 0) {
      entries.push(...Array.from({ length: 7 }, () => shift(templateIds[i]!)));
    } else {
      entries.push(...Array.from({ length: workDays }, () => shift(templateIds[i]!)));
      entries.push(...Array.from({ length: offDays }, () => off()));
    }
  }
  return entries;
}

/**
 * Converts a UI setup draft to the payload needed for DB persistence.
 * Pure — no side effects, no UUID generation, no DB calls.
 *
 * @param draft       - form state from setup screen
 * @param templateIds - pre-generated UUIDs, one per draft.templateDrafts entry
 * @param cycleId     - pre-generated UUID for the ShiftCycle
 * @param today       - YYYY-MM-DD (today's date, determines anchor and effectiveFrom)
 */
export function buildSetupPayload(
  draft: SetupDraft,
  templateIds: string[],
  cycleId: string,
  today: string,
): SetupSavePayload {
  const salaryMinor = parseTryMinor(draft.salaryText);
  const startDate = draft.startDate || null;

  const templates: ShiftTemplate[] = draft.templateDrafts.map((td, i) => {
    const partial = {
      code: td.code,
      startLocalTime: td.startLocalTime,
      colorToken: undefined as string | undefined,
    };
    const kind = shiftKindOf(partial);
    return {
      id: templateIds[i]!,
      code: td.code,
      name: td.name,
      startLocalTime: td.startLocalTime,
      endLocalTime: td.endLocalTime,
      breakMinutes: td.breakMinutes,
      standardMinutes: shiftNominalMinutes(td.startLocalTime, td.endLocalTime),
      colorToken: kind,
    };
  });

  const entries = buildCycleEntries(draft.workSchedule, draft.shiftPattern, templateIds);
  const anchor = mondayOfLocalDate(today);
  const phaseCount = draft.shiftPattern === 'THREE_SHIFT' ? 3 : 2;
  const startIndex = needsCurrentShiftStep(draft.shiftPattern)
    ? Math.round((draft.currentShiftIndex * entries.length) / phaseCount) % entries.length
    : 0;

  const cycle: ShiftCycle = {
    id: cycleId,
    name: 'Vardiya düzenim',
    timezone: 'Europe/Istanbul',
    anchorLocalDate: anchor,
    startIndex,
    entries,
  };

  const periodStart = getPayPeriodForDate(today, draft.payday).start;
  const effectiveFrom = mondayOfLocalDate(periodStart);

  return {
    salaryMinor,
    salaryType: draft.salaryType,
    payday: draft.payday,
    besEnabled: draft.besEnabled,
    besRateBp: Number(draft.besRateBp),
    workSchedule: draft.workSchedule,
    shiftPattern: draft.shiftPattern,
    startDate,
    templates,
    cycle,
    effectiveFrom,
  };
}
