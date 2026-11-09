import { daysInMonth, localDateForMonthDay, mondayFirstOffset } from './dates.ts';

export type ShiftIconName = 'sunny-outline' | 'partly-sunny-outline' | 'moon-outline' | 'bed-outline' | 'leaf-outline'
  | 'medkit-outline' | 'close-circle' | 'checkmark-circle' | 'remove-outline';
export type CalendarTone = 'accent' | 'muted' | 'warning' | 'danger' | 'success';

export function canStartClockIn(hasActiveSession: boolean, hasCompletedRecordToday: boolean): boolean {
  return !hasActiveSession && !hasCompletedRecordToday;
}
export function hasUnsavedPlanDraft(baseline: string, draft: string): boolean {
  return baseline !== draft;
}

export function calendarMonthDates(month: string): string[] {
  return Array.from({ length: daysInMonth(month) }, (_, index) => localDateForMonthDay(month, index + 1));
}

export type CalendarMonthSlot = { kind: 'padding'; key: string; interactive: false } | { kind: 'day'; date: string; interactive: true };

export function calendarMonthSlots(month: string): CalendarMonthSlot[] {
  const padding: CalendarMonthSlot[] = Array.from({ length: mondayFirstOffset(month) }, (_, index) => ({
    kind: 'padding', key: `blank-${index}`, interactive: false,
  }));
  const days: CalendarMonthSlot[] = calendarMonthDates(month).map((date) => ({ kind: 'day', date, interactive: true }));
  return [...padding, ...days];
}

export function calendarCellAccessibilityLabel(dateLabel: string, dayLabel: string, completed: boolean, differenceMinutes: number | null): string {
  const completion = completed ? 'Çalışma tamamlandı, ' : '';
  const difference = differenceMinutes === null || differenceMinutes === 0
    ? ''
    : `, mola dahil vardiya aralığı farkı ${differenceMinutes > 0 ? 'artı ' : 'eksi '}${Math.abs(differenceMinutes)} dakika`;
  return `${dateLabel}, ${completion}${dayLabel}${difference}`;
}

export function shiftIconForStartTime(localTime: string): ShiftIconName {
  const match = /^(\d{2}):([0-5]\d)$/.exec(localTime);
  if (!match || Number(match[1]) > 23) return 'sunny-outline';
  const hour = Number(match[1]);
  if (hour >= 15 && hour < 19) return 'partly-sunny-outline';
  if (hour >= 19 || hour < 6) return 'moon-outline';
  return 'sunny-outline';
}

export function calendarMarker(input: {
  planKind?: 'SHIFT' | 'OFF' | 'LEAVE';
  startLocalTime?: string;
  status?: 'LEAVE' | 'SICK_REPORT' | 'NOT_WORKED';
  completed?: boolean;
}): { icon: ShiftIconName; tone: CalendarTone } {
  if (input.completed) return { icon: 'checkmark-circle', tone: 'success' };
  if (input.status === 'NOT_WORKED') return { icon: 'close-circle', tone: 'danger' };
  if (input.status === 'SICK_REPORT') return { icon: 'medkit-outline', tone: 'warning' };
  if (input.status === 'LEAVE' || input.planKind === 'LEAVE') return { icon: 'bed-outline', tone: 'warning' };
  if (input.planKind === 'OFF') return { icon: 'bed-outline', tone: 'muted' };
  if (input.planKind === 'SHIFT') return { icon: shiftIconForStartTime(input.startLocalTime ?? '08:00'), tone: 'accent' };
  return { icon: 'remove-outline', tone: 'muted' };
}
