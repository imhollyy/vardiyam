import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';

export type ShiftBlockKind = 'day' | 'evening' | 'night' | 'leave' | 'holiday' | 'off';

type ShiftBlockProps = {
  kind: ShiftBlockKind;
  shiftName: string;
  timeRange?: string;        // '08:00 – 20:00'
  breakLabel?: string;       // '60 dk mola'
  onChangePress?: () => void;
  primaryLabel?: string;     // 'Mesai / izin ekle'
  onPrimaryPress?: () => void;
  isOff?: boolean;
  nextShiftLabel?: string;   // 'Yarın: Gece 22:00 – 08:00'
};

export function ShiftBlock({
  kind,
  shiftName,
  timeRange,
  breakLabel,
  onChangePress,
  primaryLabel,
  onPrimaryPress,
  nextShiftLabel,
}: ShiftBlockProps) {
  const { mode } = useAppTheme();
  const palette = shiftPalette[kind === 'off' ? 'holiday' : kind][mode];
  const bg = palette.background;
  const textColor = palette.text;
  const textSecondary = palette.textSecondary;

  const isLight = kind === 'day' || kind === 'evening' || kind === 'leave';

  return (
    <View style={{ backgroundColor: bg, borderRadius: layout.radius.block, padding: 20, gap: 16 }}>
      {/* Header: shift name + change link */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ gap: 4, flex: 1 }}>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, color: textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
            BUGÜN
          </Text>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: textColor, letterSpacing: -0.5 }}>
            {shiftName}
          </Text>
        </View>
        {onChangePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vardiyayı değiştir"
            onPress={onChangePress}
            style={({ pressed }) => ({
              minHeight: 36, paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: layout.radius.control,
              backgroundColor: 'rgba(0,0,0,0.1)',
              opacity: pressed ? 0.7 : 1,
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: textColor }}>Değiştir</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Time + break */}
      {timeRange ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons accessible={false} name="time-outline" size={18} color={textColor} />
          </View>
          <View>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 17, color: textColor, fontVariant: ['tabular-nums'] }}>{timeRange}</Text>
            {breakLabel ? (
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: textSecondary }}>{breakLabel}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Next shift hint */}
      {nextShiftLabel ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: textSecondary }}>{nextShiftLabel}</Text>
      ) : null}

      {/* Primary action */}
      {primaryLabel && onPrimaryPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          onPress={onPrimaryPress}
          style={({ pressed }) => ({
            backgroundColor: isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.14)',
            borderRadius: layout.radius.control,
            minHeight: layout.control.minHeight,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.body, color: textColor }}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
