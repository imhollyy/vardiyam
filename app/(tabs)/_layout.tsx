import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts } from '@/src/theme/tokens';

const destinations = [
  { name: 'index', title: 'Bugün', glyph: 'home-outline', label: 'Bugün sekmesi' },
  { name: 'calendar', title: 'Takvim', glyph: 'calendar-outline', label: 'Takvim sekmesi' },
  { name: 'earnings', title: 'Kazanç', glyph: 'wallet-outline', label: 'Kazanç sekmesi' },
  { name: 'analysis', title: 'Analiz', glyph: 'bar-chart-outline', label: 'Analiz sekmesi' },
  { name: 'settings', title: 'Ayarlar', glyph: 'settings-outline', label: 'Ayarlar sekmesi' },
] as const;

export default function TabLayout() {
  const { theme } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          minHeight: 64,
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.semiBold },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarIconStyle: { marginTop: 1 },
      }}
    >
      {destinations.map(({ name, title, glyph, label }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: label,
            tabBarIcon: ({ color, size }) => <Ionicons accessible={false} name={glyph as React.ComponentProps<typeof Ionicons>['name']} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
