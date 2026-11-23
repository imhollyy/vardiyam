import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { APP_NAME } from '@/src/config/app';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { ActionButton } from '@/src/components/ui/ActionButton';

const STEPS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'calendar-outline', text: 'Vardiya düzenini gir' },
  { icon: 'calculator-outline', text: 'Maaş ve kesintilerini hesapla' },
  { icon: 'bar-chart-outline', text: 'Aylık kazancını takip et' },
];

const TRUST: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'phone-portrait-outline', text: 'Veriler cihazında' },
  { icon: 'cloud-offline-outline', text: 'İnternet gerektirmez' },
  { icon: 'lock-closed-outline', text: 'Sunucuya veri gitmez' },
];

export default function WelcomeScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <Screen scroll={false}>
      <View style={styles.hero}>
        <View style={[styles.logoCircle, { backgroundColor: theme.accentSurface }]}>
          <Ionicons name="briefcase" size={48} color={theme.accent} />
        </View>
        <Text style={[styles.title, { color: theme.foreground }]}>{APP_NAME}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Vardiyalarını takip et, kazancını hesapla.
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow} accessibilityLabel={`${i + 1}. ${step.text}`}>
              <View style={[styles.stepIcon, { backgroundColor: theme.accentSurface }]}>
                <Ionicons accessible={false} name={step.icon} size={20} color={theme.accent} />
              </View>
              <Text style={[styles.stepText, { color: theme.foreground }]}>{step.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.trustRow}>
          {TRUST.map((item, i) => (
            <View key={i} style={styles.trustItem} accessibilityLabel={item.text}>
              <Ionicons accessible={false} name={item.icon} size={18} color={theme.muted} />
              <Text style={[styles.trustText, { color: theme.muted }]}>{item.text}</Text>
            </View>
          ))}
        </View>
        <ActionButton label="Hızlı Kurulum" onPress={() => router.replace('/setup')} icon="arrow-forward" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: layout.type.section,
    textAlign: 'center',
    lineHeight: 26,
  },
  steps: {
    marginTop: 24,
    gap: 14,
    alignSelf: 'stretch',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: layout.type.body,
    fontWeight: '600',
    flex: 1,
  },
  bottom: {
    gap: 20,
    paddingBottom: 8,
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  trustItem: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 100,
  },
  trustText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
