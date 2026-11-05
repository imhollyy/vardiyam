import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PlannedShift, ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { calendarMarker } from '@/src/features/shifts/presentation';

type ShiftKindBadgeProps = {
  kind: PlannedShift['kind'];
  template?: ShiftTemplate;
  compact?: boolean;
};

const kindCopy = {
  SHIFT: { title: 'Vardiya', token: 'accent' as const, background: 'accentSurface' as const },
  OFF: { title: 'OFF', token: 'muted' as const, background: 'background' as const },
  LEAVE: { title: 'İzin', token: 'warning' as const, background: 'warningSurface' as const },
};

export function ShiftKindBadge({ kind, template, compact = false }: ShiftKindBadgeProps) {
  const { theme } = useAppTheme();
  const copy = kindCopy[kind];
  const shiftIcon = calendarMarker({ planKind: kind, startLocalTime: template?.startLocalTime }).icon;
  const title = kind === 'SHIFT' ? template?.name ?? 'Vardiya' : copy.title;
  const detail = kind === 'SHIFT' ? template?.code ?? 'V' : kind === 'OFF' ? 'Planlı boş gün' : 'İzin günü';
  const visibleTitle = compact && kind === 'SHIFT' ? detail : title;
  const accessibleTitle = kind === 'OFF'
    ? 'OFF, planlı boş gün; yasal hafta tatili sınıfı değildir'
    : `${copy.title}: ${title}, ${detail}`;

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibleTitle}
      style={[styles.badge, compact && styles.compact, { backgroundColor: theme[copy.background] }]}
    >
      <Ionicons accessible={false} name={shiftIcon} size={compact ? 13 : 17} color={theme[copy.token]} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.foreground }]}>{visibleTitle}</Text>
        {!compact ? <Text style={[styles.detail, { color: theme.muted }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compact: { minHeight: 27, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 4 },
  copy: { flexShrink: 1 },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { marginTop: 1, fontSize: 11 },
});
