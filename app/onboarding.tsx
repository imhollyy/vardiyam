import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getOnboardingState, saveOnboardingState } from '@/src/data/appPreferencesRepository';
import { getPlannedShiftsForRange, listShiftCycles } from '@/src/data/shiftCycleRepository';
import { addLocalDays, getLocalToday } from '@/src/features/shifts/dates';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

const STEPS = [
  { title: 'Vardiyam’a hoş geldin', intro: 'Vardiya planını, fiilî çalışmanı ve ödemelerini kendi cihazında takip et.', icon: 'calendar-clear-outline' as const },
  { title: 'Vardiya düzenini kur', intro: 'Döngünü, vardiya saatlerini ve başlangıç gününü mevcut plan ekranında oluştur. Kaydettiğin bilgiler adımlar arasında korunur.', icon: 'time-outline' as const },
  { title: 'Ücret ve dönem isteğe bağlı', intro: 'İşyeri tercihlerini, bordro dönemini ve istersen ücret türünü ayarlayabilirsin. Ücret bilgisi girmeden vardiya takibini kullanmaya devam edebilirsin.', icon: 'wallet-outline' as const },
  { title: 'Kurulum özeti', intro: 'Hazır olduğunda vardiyalarını günlük ekrandan takip edebilirsin.', icon: 'checkmark-circle-outline' as const },
];

export default function OnboardingScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleSummary, setScheduleSummary] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOnboardingState(database).then((state) => { if (active) setStep(state.step); })
      .catch(() => { if (active) setError('Kurulum adımı yüklenemedi.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [database]);

  useEffect(() => {
    if (step !== 3) return;
    let active = true;
    void listShiftCycles(database).then(async (cycles) => {
      if (!active) return;
      const cycle = cycles[0];
      if (!cycle) { setScheduleSummary('Henüz vardiya düzeni yok · Ayarlar’dan dilediğin zaman oluşturabilirsin.'); return; }
      const start = getLocalToday(cycle.timezone);
      const preview = await getPlannedShiftsForRange(database, cycle.id, start, addLocalDays(start, 6));
      if (!active) return;
      const shifts = preview.filter((day) => day.kind === 'SHIFT').length;
      const offDays = preview.filter((day) => day.kind === 'OFF').length;
      const leaveDays = preview.filter((day) => day.kind === 'LEAVE').length;
      setScheduleSummary(`${cycle.name} · Önümüzdeki 7 gün: ${shifts} vardiya, ${offDays} OFF${leaveDays ? `, ${leaveDays} izin` : ''}.`);
    }).catch(() => { if (active) setScheduleSummary('Vardiya özeti yüklenemedi. Ayarlar’dan kontrol edebilirsin.'); });
    return () => { active = false; };
  }, [database, step]);

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
  const skipWage = async () => { await saveStep(3); };

  const current = STEPS[step] ?? STEPS[0];
  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kurulum hazırlanıyor…</Text></View>;
  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}>
    <View style={styles.top}><View style={[styles.brandIcon, { backgroundColor: theme.accentSurface }]}><Ionicons name={current.icon} size={27} color={theme.accent} /></View><Text style={[styles.stepText, { color: theme.muted }]}>ADIM {step + 1} / {STEPS.length}</Text></View>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{current.title}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{current.intro}</Text>
      {step === 0 ? <View style={[styles.privacy, { backgroundColor: theme.accentSurface }]}><Ionicons name="phone-portrait-outline" size={18} color={theme.accent} /><Text style={[styles.privacyText, { color: theme.foreground }]}>Temel kayıtların bu cihazda tutulur. Hesap açman gerekmez.</Text></View> : null}
      {step === 1 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void openSettings('/(tabs)/settings')} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Ionicons name="settings-outline" size={18} color={theme.onPrimaryAction} /><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Vardiya düzenini oluştur</Text></Pressable> : null}
      {step === 2 ? <>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void continueStep()} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Ionicons name="settings-outline" size={18} color={theme.onPrimaryAction} /><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Ücret ve dönem ayarlarını aç</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void skipWage()} style={styles.later}><Text style={{ color: theme.muted, fontWeight: '700' }}>Şimdi değil</Text></Pressable>
      </> : step === 3 ? <>
        <View accessibilityLiveRegion="polite" style={[styles.privacy, { backgroundColor: theme.accentSurface }]}><Ionicons name="calendar-outline" size={18} color={theme.accent} /><Text style={[styles.privacyText, { color: theme.foreground }]}>{scheduleSummary ?? 'Vardiya düzeni yükleniyor…'}</Text></View>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void continueStep()} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Uygulamaya geç</Text><Ionicons name="arrow-forward" size={18} color={theme.onPrimaryAction} /></Pressable>
      </> : <Pressable accessibilityRole="button" disabled={saving} onPress={() => void continueStep()} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>{step === 0 ? 'Başlayalım' : 'Vardiya düzenini oluştur'}</Text><Ionicons name="arrow-forward" size={18} color={theme.onPrimaryAction} /></Pressable>}
      {step === 1 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveStep(2)} style={styles.later}><Text style={{ color: theme.muted, fontWeight: '700' }}>Vardiya düzenini sonra kur</Text></Pressable> : null}
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
