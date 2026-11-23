import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.eyebrow, { color: theme.mutedSoft }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4, marginBottom: 2 },
  eyebrow: { fontFamily: fonts.bold, fontSize: layout.type.label, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontFamily: fonts.extraBold, fontSize: layout.type.title, lineHeight: 34, letterSpacing: -0.6 },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
});
