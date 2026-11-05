import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppDatabaseProvider } from '@/src/data/AppDatabaseProvider';
import { AppThemeProvider, useAppTheme } from '@/src/theme/AppThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
  const { mode, ready, theme } = useAppTheme();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="work-records" />
        <Stack.Screen name="earnings-settings" />
        <Stack.Screen name="net-payments" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="account" />
      </Stack>
    </>
  );
}
