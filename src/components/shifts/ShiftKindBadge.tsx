import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PlannedShift, ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, shiftPalette } from '@/src/theme/tokens';
import { calendarMarker } from '@/src/features/shifts/presentation';

type ShiftKindBadgeProps = {
  kind: PlannedShift['kind'];
  template?: ShiftTemplate;
  compact?: boolean;
};

export function ShiftKindBadge({ kind, template, compact = false }: ShiftKindBadgeProps) {
  const { theme, mode } = useAppTheme();
  const shiftIcon = calendarMarker({ planKind: kind, startLocalTime: template?.startLocalTime }).icon;
  const title = kind === 'SHIFT' ? template?.name ?? 'Vardiya' : kind === 'OFF' ? 'OFF' : 'İzin';
  const detail = kind === 'SHIFT' ? template?.code ?? 'V' : kind === 'OFF' ? 'Planlı boş gün' : 'İzin günü';
  const visibleTitle = compact && kind === 'SHIFT' ? detail : title;
  const accessibleTitle = kind === 'OFF'
    ? 'OFF, planlı boş gün; yasal hafta tatili sınıfı değildir'
    : `${title}: ${detail}`;

  const palette = kind === 'SHIFT'
    ? shiftPalette.day[mode]
    : kind === 'LEAVE'
    ? shiftPalette.leave[mode]
    : { background: theme.surfaceMuted, text: theme.muted, textSecondary: theme.muted };

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibleTitle}
      style={[styles.badge, compact && styles.compact, { backgroundColor: palette.background }]}
    >
      <Ionicons accessible={false} name={shiftIcon} size={compact ? 13 : 17} color={palette.text} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>{visibleTitle}</Text>
        {!compact ? <Text style={[styles.detail, { color: palette.textSecondary }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compact: { minHeight: 27, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 4 },
  copy: { flexShrink: 1 },
  title: { fontFamily: fonts.bold, fontSize: 13 },
  detail: { fontFamily: fonts.medium, marginTop: 1, fontSize: 11 },
});
