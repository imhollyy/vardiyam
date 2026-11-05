import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/theme/tokens';

type PlaceholderScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PlaceholderScreen({ eyebrow, title, description }: PlaceholderScreenProps) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>
          {title}
        </Text>
        <View
          accessibilityRole="summary"
          style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.marker, { backgroundColor: theme.accentSurface }]}>
            <Text accessible={false} style={[styles.markerText, { color: theme.accent }]}>V</Text>
          </View>
          <Text style={[styles.panelTitle, { color: theme.foreground }]}>Başlangıç ekranı</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{description}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 8, fontSize: 32, fontWeight: '700' },
  panel: { marginTop: 32, padding: 20, borderWidth: 1, borderRadius: 20 },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: { fontSize: 20, fontWeight: '700' },
  panelTitle: { marginTop: 18, fontSize: 18, fontWeight: '700' },
  description: { marginTop: 8, fontSize: 16, lineHeight: 24 },
});
