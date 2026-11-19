import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { theme } = useAppTheme();
  return <View style={styles.wrap}>
    <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{title}</Text>
    {subtitle ? <Text style={[styles.subtitle, { color: theme.muted }]}>{subtitle}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4, marginBottom: 2 },
  eyebrow: { fontSize: layout.type.caption, letterSpacing: 1.1, fontWeight: '900' },
  title: { fontSize: layout.type.title, lineHeight: 36, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 21 },
});
