export type ShiftIconName = 'sunny-outline' | 'partly-sunny-outline' | 'moon-outline' | 'bed-outline' | 'leaf-outline'
  | 'medkit-outline' | 'close-circle' | 'checkmark-circle' | 'remove-outline';
export type CalendarTone = 'accent' | 'muted' | 'warning' | 'danger' | 'success';

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
