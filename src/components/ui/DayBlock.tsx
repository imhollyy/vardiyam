import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';

export type DayBlockStatus = 'shift' | 'overtime' | 'leave' | 'holiday' | 'off' | 'today' | 'planned';

type DayBlockProps = {
  dayLabel: string;      // 'Pzt'
  dateNumber: string;    // '23'
  code: string;          // 'G', 'GC', 'İZİN', '—'
  status: DayBlockStatus;
  isToday?: boolean;
  hasOvertime?: boolean;
  overtimeLabel?: string; // '+2sa'
  onPress?: () => void;
};

function useDayColors(status: DayBlockStatus, mode: 'light' | 'dark') {
  const { theme } = useAppTheme();
  if (status === 'shift' || status === 'overtime' || status === 'today') {
    return { bg: shiftPalette.day[mode].background, text: shiftPalette.day[mode].text };
  }
  if (status === 'leave') {
    return { bg: shiftPalette.leave[mode].background, text: shiftPalette.leave[mode].text };
  }
  if (status === 'holiday') {
    return { bg: shiftPalette.holiday[mode].background, text: shiftPalette.holiday[mode].text };
  }
  if (status === 'planned') {
    return { bg: shiftPalette.planned[mode].background, text: shiftPalette.planned[mode].text };
  }
  return { bg: theme.surfaceSunken, text: theme.muted };
}

export function DayBlock({ dayLabel, dateNumber, code, status, isToday = false, hasOvertime = false, overtimeLabel, onPress }: DayBlockProps) {
  const { theme, mode } = useAppTheme();
  const { bg, text } = useDayColors(status, mode);
  const isPlanned = status === 'planned';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel} ${dateNumber}, ${code}${hasOvertime ? ', fazla mesai' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [{
        width: 44,
        height: 72,
        borderRadius: layout.radius.day,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        borderWidth: isToday ? 3 : isPlanned ? 2 : 0,
        borderColor: isToday ? theme.ink : isPlanned ? '#D9B44A' : 'transparent',
        borderStyle: isPlanned ? 'dashed' : 'solid',
        opacity: pressed ? 0.8 : 1,
      }]}
    >
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 10, color: text, opacity: 0.7 }}>{dayLabel}</Text>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 15, color: text, fontVariant: ['tabular-nums'] }}>{dateNumber}</Text>
      <View style={{ minWidth: 22, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, color: text, letterSpacing: 0.3 }}>{code}</Text>
      </View>
      {hasOvertime && overtimeLabel ? (
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 9, color: text, opacity: 0.85 }}>{overtimeLabel}</Text>
      ) : hasOvertime ? (
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FFD166' }} />
      ) : null}
    </Pressable>
  );
}
