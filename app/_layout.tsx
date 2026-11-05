import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { initializeDatabase } from '@/src/data/database';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="vardiyam.db" onInit={initializeDatabase}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="work-records" />
        <Stack.Screen name="earnings-settings" />
      </Stack>
    </SQLiteProvider>
  );
}
