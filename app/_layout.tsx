import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppDatabaseProvider } from '@/src/data/AppDatabaseProvider';

export default function RootLayout() {
  return (
    <AppDatabaseProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="work-records" />
        <Stack.Screen name="earnings-settings" />
        <Stack.Screen name="net-payments" />
        <Stack.Screen name="backup" />
      </Stack>
    </AppDatabaseProvider>
  );
}
