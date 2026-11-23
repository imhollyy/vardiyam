import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

type StatTileProps = {
  value: string;
  label: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted';
  style?: StyleProp<ViewStyle>;
};

export function StatTile({ value, label, tone = 'accent', style }: StatTileProps) {
  const { theme } = useAppTheme();
  const color = theme[tone];
  return (
    <View accessibilityRole="summary" accessibilityLabel={`${label}: ${value}`} style={[styles.tile, style]}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', gap: 2, minWidth: 64 },
  value: { fontFamily: fonts.extraBold, fontSize: layout.type.section, fontVariant: ['tabular-nums'] },
  label: { fontFamily: fonts.semiBold, fontSize: layout.type.caption },
});
