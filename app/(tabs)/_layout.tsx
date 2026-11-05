import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useAppTheme } from '@/src/theme/AppThemeProvider';

const destinations = [
  { name: 'index', title: 'Bugün', glyph: '◷', label: 'Bugün sekmesi' },
  { name: 'calendar', title: 'Takvim', glyph: '▦', label: 'Takvim sekmesi' },
  { name: 'earnings', title: 'Kazanç', glyph: '₺', label: 'Kazanç sekmesi' },
  { name: 'settings', title: 'Ayarlar', glyph: '⚙', label: 'Ayarlar sekmesi' },
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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      {destinations.map(({ name, title, glyph, label }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: label,
            tabBarIcon: ({ color, size }) => (
              <Text accessible={false} style={{ color, fontSize: size }}>
                {glyph}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
