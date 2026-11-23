import type { WorkSchedule, ShiftPattern } from '../domain/payroll/types.ts';

export type DefaultShiftHours = {
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  breakMinutes: number;
};

/** Legal minimum break per shift duration (İş Kanunu md. 68). */
export function legalMinBreakMinutes(nominalMinutes: number): number {
  if (nominalMinutes <= 240) return 15;
  if (nominalMinutes <= 450) return 30;
  return 60;
}

export const DEFAULT_SHIFT_HOURS: Record<WorkSchedule, Record<ShiftPattern, DefaultShiftHours[]>> = {
  MON_FRI: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '18:00', breakMinutes: 60 },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '08:00', breakMinutes: 60 },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '18:00', breakMinutes: 60 },
      { code: 'GC', name: 'Gece', startLocalTime: '22:00', endLocalTime: '08:00', breakMinutes: 60 },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
      { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00', breakMinutes: 30 },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
  },
  MON_SAT: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
      { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00', breakMinutes: 30 },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
  },
  EVERY_DAY: {
    FIXED_DAY: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
    ],
    FIXED_NIGHT: [
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
    TWO_SHIFT: [
      { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
    THREE_SHIFT: [
      { code: 'S', name: 'Sabah', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
      { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00', breakMinutes: 30 },
      { code: 'GC', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
    ],
  },
};

export function shiftNominalMinutes(startLocalTime: string, endLocalTime: string): number {
  const [sh, sm] = startLocalTime.split(':').map(Number) as [number, number];
  const [eh, em] = endLocalTime.split(':').map(Number) as [number, number];
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return endMin > startMin ? endMin - startMin : 1440 - startMin + endMin;
}
