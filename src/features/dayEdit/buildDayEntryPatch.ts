import type { LeaveType } from '../../domain/payroll/types.ts';
import type { DayEntryPatch } from '../../data/dayEntryRepository.ts';
import { LEAVE_TYPES } from '../../config/payroll.ts';

export type QuickMode = 'overtime' | 'lateEarly' | 'leave' | 'shiftOverride' | null;

export type DayEditFormState = {
  quickMode: QuickMode;
  overtimeHours: number;
  lateEarlyHours: number;
  leaveType: LeaveType | null;
  leaveHalfDay: boolean;
  leaveHourly: number;
  leaveDeducted: boolean;
  shiftOverrideId: string | null;
  note: string;
};

/** Default deduction flag for a leave type, from domain config (authoritative). */
export function leaveDefaultDeducted(leaveType: LeaveType): boolean {
  return LEAVE_TYPES.find((lt) => lt.code === leaveType)?.deductFromSalary ?? false;
}

/**
 * Returns the DayEntryPatch to upsert, or null if the entry should be deleted.
 *
 * Conflict rules (enforced even if caller didn't clear state):
 * - quickMode='leave' with leaveType set → overtimeMinutes = lateEarlyMinutes = 0
 * - any other quickMode → leaveType = null in patch
 * - deductOverride is null when it matches the domain default for the type
 * - leaveHours only written for HOURLY type
 */
export function buildDayEntryPatch(state: DayEditFormState): DayEntryPatch | null {
  const isLeaveMode = state.quickMode === 'leave' && state.leaveType !== null;

  const leaveType: LeaveType | null = isLeaveMode ? state.leaveType : null;
  const leaveHalfDay = isLeaveMode && state.leaveHalfDay;
  const leaveHours = isLeaveMode && state.leaveType === 'HOURLY'
    ? Math.max(0, state.leaveHourly)
    : 0;

  const overtime = isLeaveMode ? 0 : Math.max(0, Math.round(state.overtimeHours * 60));
  const lateEarly = isLeaveMode ? 0 : Math.max(0, Math.round(state.lateEarlyHours * 60));
  const shiftOverride = state.shiftOverrideId;
  const noteVal = state.note.trim() || null;

  const hasData = overtime > 0 || lateEarly > 0 || leaveType !== null
    || shiftOverride !== null || noteVal !== null;
  if (!hasData) return null;

  let deductOverride: boolean | null = null;
  if (leaveType !== null && leaveType !== 'HOLIDAY') {
    const def = leaveDefaultDeducted(leaveType);
    deductOverride = state.leaveDeducted === def ? null : state.leaveDeducted;
  }

  return {
    overtimeMinutes: overtime,
    lateEarlyMinutes: lateEarly,
    leaveType,
    leaveHalfDay,
    leaveHours,
    deductOverride,
    note: noteVal,
    shiftOverrideId: shiftOverride,
  };
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: 'Yıllık izin',
  UNPAID: 'Ücretsiz izin',
  SICK: 'Hastalık raporu',
  EXCUSE: 'Mazeret izni',
  MATERNITY: 'Doğum izni',
  BEREAVEMENT: 'Ölüm izni',
  SOCIAL: 'Sosyal izin',
  HOURLY: 'Saatlik izin',
  HOLIDAY: 'Resmî tatil',
};

/** One-line save preview shown above the save button. */
export function buildSaveSummary(state: DayEditFormState): string | null {
  if (state.quickMode === 'leave' && state.leaveType) {
    if (state.leaveType === 'HOURLY')
      return `Kaydedilecek: ${state.leaveHourly} sa saatlik izin`;
    const label = LEAVE_TYPE_LABELS[state.leaveType] ?? state.leaveType;
    return state.leaveHalfDay ? `Kaydedilecek: Yarım gün — ${label}` : `Kaydedilecek: ${label}`;
  }
  if (state.quickMode === 'overtime' && state.overtimeHours > 0)
    return `Kaydedilecek: +${state.overtimeHours} sa mesai`;
  if (state.quickMode === 'lateEarly' && state.lateEarlyHours > 0)
    return `Kaydedilecek: −${state.lateEarlyHours} sa geç/erken`;
  return null;
}
