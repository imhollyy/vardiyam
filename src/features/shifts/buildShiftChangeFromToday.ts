import type { ShiftCycle } from '../../domain/shift-cycle/index.ts';

function isoWeekDay(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  // Sun=0 in JS → shift so Mon=0, ..., Sun=6
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/**
 * Computes the new cycle anchor/startIndex so that `today` maps to
 * the first entry in `targetTemplateId`'s block.
 *
 * blockSize is always 7 (workDays + offDays = 7 for any work schedule),
 * so targetBlockStart = floor(firstMatchIndex / 7) * 7.
 */
export function buildShiftChangeFromToday(params: {
  today: string;
  targetTemplateId: string;
  currentCycle: ShiftCycle;
}): { effectiveFrom: string; anchorLocalDate: string; startIndex: number } {
  const { today, targetTemplateId, currentCycle } = params;
  const entries = currentCycle.entries;

  const firstMatchIndex = entries.findIndex(
    (e) => e.kind === 'SHIFT' && e.templateId === targetTemplateId,
  );
  if (firstMatchIndex === -1) {
    throw new Error('Hedef vardiya bu rotasyonda bulunamadi.');
  }

  const targetBlockStart = Math.floor(firstMatchIndex / 7) * 7;
  const weekDay = isoWeekDay(today);
  const startIndex = (targetBlockStart + weekDay) % entries.length;

  return { effectiveFrom: today, anchorLocalDate: today, startIndex };
}
