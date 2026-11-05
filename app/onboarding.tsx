import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getOnboardingState, saveOnboardingState } from '@/src/data/appPreferencesRepository';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

const STEPS = [
  { title: 'Vardiyam’a hoş geldin', intro: 'Vardiya planını, fiilî çalışmanı ve ödemelerini kendi cihazında takip et.', icon: 'calendar-clear-outline' as const },
  { title: 'Vardiya düzenini kur', intro: 'Döngünü, vardiya saatlerini ve başlangıç gününü mevcut plan ekranında oluştur. Kaydettiğin bilgiler adımlar arasında korunur.', icon: 'time-outline' as const },
  { title: 'İşyeri ve dönem', intro: 'Haftalık süre, bordro dönemi ve işyeri kurallarını ayrı ayrı gözden geçir. Bunlar ayarlanabilir işyeri tercihleridir.', icon: 'business-outline' as const },
  { title: 'Ücret bilgisi isteğe bağlı', intro: 'Aylık brüt, saatlik brüt, yalnız net takibi veya ücret girmeden devam seçebilirsin. İstersen bu adımı şimdi atla.', icon: 'wallet-outline' as const },
];

export default function OnboardingScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOnboardingState(database).then((state) => { if (active) setStep(state.step); })
      .catch(() => { if (active) setError('Kurulum adımı yüklenemedi.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [database]);

  const saveStep = async (next: number, completed = false) => {
    setSaving(true); setError(null);
    try { await saveOnboardingState(database, { step: next, completed }); setStep(next); return true; }
    catch { setError('Adım kaydedilemedi. Yerel verilerin korunuyor; yeniden deneyebilirsin.'); return false; }
    finally { setSaving(false); }
  };
  const continueStep = async () => {
    if (step === 0) { await saveStep(1); return; }
    if (step === 1) {
      if (await saveStep(2)) router.push('/(tabs)/settings');
      return;
    }
    if (step === 2) {
      if (await saveStep(3)) router.push('/earnings-settings');
      return;
    }
    if (await saveStep(3, true)) router.replace('/(tabs)');
  };
  const openSettings = async (route: '/(tabs)/settings' | '/earnings-settings') => {
    const next = step === 1 ? 2 : 3;
    if (await saveStep(next)) router.push(route);
  };
  const skipWage = async () => { if (await saveStep(3, true)) router.replace('/(tabs)'); };

  const current = STEPS[step] ?? STEPS[0];
  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kurulum hazırlanıyor…</Text></View>;
  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}>
    <View style={styles.top}><View style={[styles.brandIcon, { backgroundColor: theme.accentSurface }]}><Ionicons name={current.icon} size={27} color={theme.accent} /></View><Text style={[styles.stepText, { color: theme.muted }]}>ADIM {step + 1} / {STEPS.length}</Text></View>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{current.title}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{current.intro}</Text>
      {step === 0 ? <View style={[styles.privacy, { backgroundColor: theme.accentSurface }]}><Ionicons name="phone-portrait-outline" size={18} color={theme.accent} /><Text style={[styles.privacyText, { color: theme.foreground }]}>Temel kayıtların bu cihazda tutulur. Hesap açman gerekmez.</Text></View> : null}
      {step === 1 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void openSettings('/(tabs)/settings')} style={[styles.primary, { backgroundColor: theme.accent }]}><Ionicons name="settings-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Vardiya düzenini oluştur</Text></Pressable> : null}
      {step === 2 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void openSettings('/earnings-settings')} style={[styles.primary, { backgroundColor: theme.accent }]}><Ionicons name="business-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Dönem ve işyeri ayarları</Text></Pressable> : null}
      {step === 3 ? <>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => router.push('/earnings-settings')} style={[styles.primary, { backgroundColor: theme.accent }]}><Ionicons name="wallet-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Ücret seçeneklerini aç</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void skipWage()} style={[styles.secondary, { borderColor: theme.border }]}><Text style={{ color: theme.foreground, fontWeight: '800' }}>Atla ve uygulamaya geç</Text></Pressable>
      </> : <Pressable accessibilityRole="button" disabled={saving} onPress={() => void continueStep()} style={[styles.primary, { backgroundColor: theme.accent }]}><Text style={styles.primaryText}>{step === 0 ? 'Başlayalım' : 'Bu adımı tamamla'}</Text><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></Pressable>}
      {step > 0 && step < 3 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveStep(step + 1)} style={styles.later}><Text style={{ color: theme.muted, fontWeight: '700' }}>Şimdi değil, sonraki adım</Text></Pressable> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger, lineHeight: 20 }}>{error}</Text> : null}
      {saving ? <ActivityIndicator color={theme.accent} /> : null}
    </View>
    <View style={styles.progress}>{STEPS.map((item, index) => <View key={item.title} style={[styles.dot, { backgroundColor: index <= step ? theme.accent : theme.border }]} />)}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 22, paddingTop: 56, justifyContent: 'center', gap: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  top: { gap: 14, alignItems: 'center' }, brandIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 11, letterSpacing: 1.4, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 17 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  privacy: { borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, privacyText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  primary: { minHeight: 52, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 48, borderWidth: 1, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  later: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, progress: { flexDirection: 'row', alignSelf: 'center', gap: 8 }, dot: { width: 8, height: 8, borderRadius: 4 },
});
