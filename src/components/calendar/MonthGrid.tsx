import { Pressable, Text, View } from 'react-native';

import type { DerivedDay, LeaveType } from '@/src/domain/payroll/index';
import type { ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { fonts, layout, shiftPalette, type ShiftKind } from '@/src/theme/tokens';
import { colors } from '@/src/theme/tokens';

const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const LEAVE_ABBREV: Record<LeaveType, string> = {
  ANNUAL: 'İzn', UNPAID: 'ÜI', SICK: 'Rp', EXCUSE: 'Mz',
  MATERNITY: 'Dğ', BEREAVEMENT: 'Az', SOCIAL: 'Sy', HOURLY: 'Sl', HOLIDAY: 'Tt',
};

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];

export type MonthGridProps = {
  year: number;
  month: number;
  today: string;
  dayMap: Map<string, DerivedDay>;
  templateMap: Map<string, ShiftTemplate>;
  theme: Theme;
  mode: 'light' | 'dark';
  onDayPress?: (date: string) => void;
};

function buildMonthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month - 1, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: startDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

function cellBg(day: DerivedDay | undefined, templateMap: Map<string, ShiftTemplate>, mode: 'light' | 'dark'): string | undefined {
  if (!day) return undefined;
  if (day.status === 'LEAVE') return shiftPalette.leave[mode].background;
  if (day.status === 'HOLIDAY') return shiftPalette.holiday[mode].background;
  if (day.status === 'WORKED') {
    const tpl = day.shiftTemplateId ? templateMap.get(day.shiftTemplateId) : undefined;
    const kind = (tpl?.colorToken ?? 'day') as ShiftKind;
    return shiftPalette[kind]?.[mode].background ?? shiftPalette.day[mode].background;
  }
  return undefined;
}

function cellFg(day: DerivedDay | undefined, templateMap: Map<string, ShiftTemplate>, mode: 'light' | 'dark', inkColor: string): string {
  if (!day) return inkColor;
  if (day.status === 'LEAVE') return shiftPalette.leave[mode].text;
  if (day.status === 'HOLIDAY') return shiftPalette.holiday[mode].text;
  if (day.status === 'WORKED') {
    const tpl = day.shiftTemplateId ? templateMap.get(day.shiftTemplateId) : undefined;
    const kind = (tpl?.colorToken ?? 'day') as ShiftKind;
    return shiftPalette[kind]?.[mode].text ?? inkColor;
  }
  return inkColor;
}

function cellCode(day: DerivedDay | undefined, templateMap: Map<string, ShiftTemplate>): string | null {
  if (!day) return null;
  if (day.status === 'HOLIDAY') return 'T';
  if (day.status === 'LEAVE') return day.leaveType ? (LEAVE_ABBREV[day.leaveType] ?? 'İ') : 'İ';
  if (day.status === 'WORKED' && day.shiftTemplateId) {
    const tpl = templateMap.get(day.shiftTemplateId);
    if (tpl?.code) return tpl.code;
    return 'G';
  }
  return null;
}

function fmtMin(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}sa` : `${minutes}dk`;
}

export function MonthGrid({ year, month, today, dayMap, templateMap, theme, mode, onDayPress }: MonthGridProps) {
  const cells = buildMonthCells(year, month);

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {WEEKDAY_HEADERS.map((h) => (
          <Text
            key={h}
            style={{ flex: 1, textAlign: 'center', fontSize: layout.type.caption, fontFamily: fonts.semiBold, color: theme.muted }}
          >
            {h}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e-${i}`} style={{ width: '14.28%', minHeight: 50 }} />;
          const day = dayMap.get(date);
          const isToday = date === today;
          const bg = cellBg(day, templateMap, mode);
          const fg = cellFg(day, templateMap, mode, theme.ink);
          const code = cellCode(day, templateMap);
          const otMin = day?.overtimeMinutes ?? 0;
          const leMin = day?.lateEarlyMinutes ?? 0;
          const dateNum = date.split('-')[2] ?? '';

          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${dateNum}${day?.status ? ', ' + day.status : ''}${otMin > 0 ? ', fazla mesai ' + fmtMin(otMin) : ''}`}
              onPress={() => onDayPress?.(date)}
              style={({ pressed }) => ({ width: '14.28%', minHeight: 50, padding: 2, opacity: pressed ? 0.75 : 1 })}
            >
              <View style={{
                flex: 1,
                borderRadius: layout.radius.day,
                backgroundColor: bg,
                borderWidth: isToday ? 2 : 0,
                borderColor: isToday ? theme.ink : 'transparent',
                padding: 3,
                alignItems: 'center',
                justifyContent: 'flex-start',
                minHeight: 46,
              }}>
                <Text style={{ fontFamily: isToday ? fonts.extraBold : fonts.semiBold, fontSize: 13, color: fg, lineHeight: 18 }}>
                  {dateNum}
                </Text>
                {code ? (
                  <Text style={{ fontFamily: fonts.bold, fontSize: 8, color: fg, opacity: 0.75, lineHeight: 10 }}>
                    {code}
                  </Text>
                ) : null}
                {(otMin > 0 || leMin > 0) ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 1, marginTop: 1 }}>
                    {otMin > 0 ? (
                      <Text style={{ fontSize: 7, fontFamily: fonts.bold, color: theme.warning, lineHeight: 9 }}>
                        +{fmtMin(otMin)}
                      </Text>
                    ) : null}
                    {leMin > 0 ? (
                      <Text style={{ fontSize: 7, fontFamily: fonts.bold, color: theme.danger, lineHeight: 9 }}>
                        −{fmtMin(leMin)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
