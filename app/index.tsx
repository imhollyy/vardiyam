import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

export default function EntryScreen() {
  const database = useAppDatabase();
  const { theme } = useAppTheme();
  const [destination, setDestination] = useState<'/(tabs)' | '/welcome' | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getSettings(database).then((settings) => {
      if (active) setDestination(settings.setupCompleted ? '/(tabs)' : '/welcome');
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [database, attempt]);
  if (destination) return <Redirect href={destination} />;
  return <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
    {failed ? <><Text accessibilityRole="alert" style={{ color: theme.danger, textAlign: 'center' }}>Başlangıç bilgileri açılamadı. Yerel verilerin korunuyor.</Text><Pressable accessibilityRole="button" onPress={() => { setFailed(false); setAttempt((value) => value + 1); }}><Text style={{ color: theme.accent, fontWeight: '800', padding: 12 }}>Yeniden dene</Text></Pressable></> : <><ActivityIndicator color={theme.accent} /><Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>Uygulama hazırlanıyor…</Text></>}
  </View>;
}
