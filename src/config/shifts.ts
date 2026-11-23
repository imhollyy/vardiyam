import type { WorkSchedule, ShiftPattern } from '../domain/payroll/types.ts';

export type DefaultShiftHours = {
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
};

export const DEFAULT_SHIFT_HOURS: Record<WorkSchedule, Record<ShiftPattern, DefaultShiftHours[]>> = {
  MON_FRI: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '17:00' },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '07:00' },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '18:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '08:00' },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '08:00', endLocalTime: '16:00' },
      { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
    ],
  },
  MON_SAT: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '06:00' },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '18:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '08:00' },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '08:00', endLocalTime: '16:00' },
      { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
    ],
  },
  EVERY_DAY: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '06:00' },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '20:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '20:00', endLocalTime: '08:00' },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '06:00', endLocalTime: '14:00' },
      { code: 'A', name: 'Akşam', startLocalTime: '14:00', endLocalTime: '22:00' },
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '06:00' },
    ],
  },
};

export const DAILY_STANDARD_BY_SCHEDULE: Record<WorkSchedule, number> = {
  MON_FRI: 540,
  MON_SAT: 450,
  EVERY_DAY: 450,
};

export function shiftNominalMinutes(startLocalTime: string, endLocalTime: string): number {
  const [sh, sm] = startLocalTime.split(':').map(Number) as [number, number];
  const [eh, em] = endLocalTime.split(':').map(Number) as [number, number];
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return endMin > startMin ? endMin - startMin : 1440 - startMin + endMin;
}

export function shiftOvertimeDelta(
  startLocalTime: string,
  endLocalTime: string,
  workSchedule: WorkSchedule,
): number {
  return shiftNominalMinutes(startLocalTime, endLocalTime) - DAILY_STANDARD_BY_SCHEDULE[workSchedule];
}
