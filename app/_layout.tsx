import { Component, useEffect, type PropsWithChildren, type ErrorInfo } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppDatabaseProvider } from '@/src/data/AppDatabaseProvider';
import { AppThemeProvider, useAppTheme } from '@/src/theme/AppThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

class RootErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('RootErrorBoundary:', error, info.componentStack); }
  render() {
    if (this.state.error) {
      void SplashScreen.hideAsync().catch(() => undefined);
      return (
        <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#FFF' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#C43D44', marginBottom: 12 }}>Uygulama hatası</Text>
          <Text style={{ fontSize: 14, color: '#333' }}>{this.state.error.message}</Text>
          <Text style={{ fontSize: 11, color: '#888', marginTop: 12 }}>{this.state.error.stack?.slice(0, 500)}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <AppDatabaseProvider>
        <AppThemeProvider>
          <ThemedRouter />
        </AppThemeProvider>
      </AppDatabaseProvider>
    </RootErrorBoundary>
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
        <Stack.Screen name="index" />
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
