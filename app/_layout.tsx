import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppDatabaseProvider } from '@/src/data/AppDatabaseProvider';
import { AppThemeProvider, useAppTheme } from '@/src/theme/AppThemeProvider';

export default function RootLayout() {
  return (
    <AppDatabaseProvider>
      <AppThemeProvider>
        <ThemedRouter />
      </AppThemeProvider>
    </AppDatabaseProvider>
  );
}

function ThemedRouter() {
  const { mode, theme } = useAppTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="work-records" />
        <Stack.Screen name="earnings-settings" />
        <Stack.Screen name="net-payments" />
        <Stack.Screen name="backup" />
      </Stack>
    </>
  );
}
