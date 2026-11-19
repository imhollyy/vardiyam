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
        <Stack.Screen name="welcome" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="day-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="shift-change" />
        <Stack.Screen name="additional-income" />
        <Stack.Screen name="legal/kvkk" />
        <Stack.Screen name="legal/privacy" />
      </Stack>
    </>
  );
}
