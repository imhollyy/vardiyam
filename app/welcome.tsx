import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { APP_NAME } from '@/src/config/app';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

export default function WelcomeScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.foreground }]}>{APP_NAME}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Vardiyalarını takip et, kazancını hesapla.
        </Text>
      </View>
      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/setup')}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.primaryAction, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.onPrimaryAction }]}>Başla</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: layout.screen.horizontal,
    paddingTop: 80,
    paddingBottom: layout.screen.bottom,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: layout.type.section,
    textAlign: 'center',
    lineHeight: 26,
  },
  bottom: {
    paddingBottom: 16,
  },
  button: {
    borderRadius: layout.radius.control,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: layout.control.minHeight,
  },
  buttonText: {
    fontSize: layout.type.body,
    fontWeight: '700',
  },
});
