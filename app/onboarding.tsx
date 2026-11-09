import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { appendEarningsProfileVersion, getLatestEarningsProfile } from '@/src/data/earningsRepository';
import { getOnboardingState, saveOnboardingState } from '@/src/data/appPreferencesRepository';
import { listShiftCycles, listShiftTemplates, saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import { createDefaultRules, createDefaultSettings, earningsOnboardingDraft, earningsPayEffectiveFromOnboardingSave, earningsRulesForOnboardingSave, isEarningsSettings, type EarningsSettings } from '@/src/features/earnings/profile';
import type { GrossPayMode } from '@/src/domain/earnings';
import { buildShiftSchedule, type ShiftPattern } from '@/src/features/shifts/schedule';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { getLocalToday } from '@/src/features/shifts/dates';
import { getLocalDateTimeCandidates } from '@/src/domain/work-record';
import type { ShiftTemplate } from '@/src/domain/shift-cycle';

const PATTERNS: { id: ShiftPattern; title: string }[] = [
  { id: 'fixed', title: 'Sabit' }, { id: 'weekly-three', title: 'Haftalık üçlü' },
  { id: 'two-two-two', title: '2+2+2' }, { id: 'four-two', title: '4+2' },
  { id: 'six-one', title: '6+1' }, { id: 'custom', title: 'Özel · temel döngü' },
];
const MODES: { id: GrossPayMode; title: string }[] = [
  { id: 'MONTHLY_GROSS', title: 'Aylık brüt' }, { id: 'HOURLY_GROSS', title: 'Saatlik brüt' },
  { id: 'NET_ONLY', title: 'Yalnız net takibi' }, { id: 'SKIP', title: 'Ücret girmeden kullan' },
];
const INITIAL_TEMPLATES: ShiftTemplate[] = [
  { id: 'vdy014-onboard-day', code: 'VDY14-G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { id: 'vdy014-onboard-evening', code: 'VDY14-A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
  { id: 'vdy014-onboard-night', code: 'VDY14-N', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
];

function amountMinor(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const amount = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  return Number.isSafeInteger(amount) ? amount : null;
}

export default function OnboardingScreen() {
  const database = useAppDatabase(); const router = useRouter(); const { theme } = useAppTheme();
  const [step, setStep] = useState(0); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleCanSave, setScheduleCanSave] = useState(true);
  const [payCanSave, setPayCanSave] = useState(true);
  const [pattern, setPattern] = useState<ShiftPattern>('two-two-two');
  const [anchor, setAnchor] = useState(() => getLocalToday('Europe/Istanbul'));
  const [startTemplate, setStartTemplate] = useState(0);
  const [customCycle, setCustomCycle] = useState<(number | null)[]>([0, 0, null]);
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [preservedStartEntryIndex, setPreservedStartEntryIndex] = useState<number | undefined>();
  const [mode, setMode] = useState<GrossPayMode>('SKIP'); const [pay, setPay] = useState('');
  const [periodDay, setPeriodDay] = useState('1'); const [weeklyHours, setWeeklyHours] = useState('45');
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => { let active = true; void Promise.all([getOnboardingState(database), listShiftCycles(database), listShiftTemplates(database),
    getLatestEarningsProfile<EarningsSettings, ReturnType<typeof createDefaultRules>>(database)]).then(([state, cycles, savedTemplates, latestProfile]) => {
    if (!active) return;
    setStep(state.step);
    if (latestProfile && isEarningsSettings(latestProfile.profile)) {
      const draft = earningsOnboardingDraft(latestProfile.profile);
      setMode(draft.mode); setPay(draft.pay); setPeriodDay(draft.periodDay); setWeeklyHours(draft.weeklyHours);
    } else if (latestProfile) {
      setPayCanSave(false); setError('Kayıtlı ücret profili doğrulanamadı. Bilgilerin üzerine yazmamak için bu ayarları kaydetmeyi devre dışı bıraktım.');
    }
    const current = cycles[0];
    if (current) {
      if (current.entries.length > 14) { setScheduleCanSave(false); setError('Mevcut döngü bu ekrandan düzenlenemiyor. İlerlemen mevcut vardiya düzenini değiştirmeyecek.'); return; }
      const referencedIds = [...new Set(current.entries.flatMap((entry) => entry.kind === 'SHIFT' ? [entry.templateId] : []))];
      const copies = referencedIds.map((id, index) => {
        const source = savedTemplates.find((item) => item.id === id);
        if (!source) { setScheduleCanSave(false); throw new Error('Mevcut vardiya şablonu bulunamadı; mevcut düzeni değiştirmeden bırakıyorum.'); }
        return { ...source, id: `vdy014-onboard-${index}` };
      });
      const copiedIds = new Map(referencedIds.map((id, index) => [id, copies[index]!.id]));
      const firstShiftIndex = current.entries.findIndex((entry, index) => index === current.startIndex && entry.kind === 'SHIFT');
      const selectedIndex = firstShiftIndex >= 0 ? current.startIndex : current.entries.findIndex((entry) => entry.kind === 'SHIFT');
      const selectedId = selectedIndex >= 0 && current.entries[selectedIndex]?.kind === 'SHIFT' ? current.entries[selectedIndex].templateId : null;
      setCycleId(current.id); setPreservedStartEntryIndex(current.startIndex); setPattern('custom');
      setAnchor(current.anchorLocalDate); setTemplates(copies);
      setCustomCycle(current.entries.map((entry) => entry.kind === 'OFF' ? null : copies.findIndex((item) => item.id === copiedIds.get(entry.templateId))));
      setStartTemplate(Math.max(0, copies.findIndex((item) => item.id === selectedId)));
    }
  })
    .catch(() => { if (active) { setScheduleCanSave(false); setPayCanSave(false); setError('Kurulum bilgisi yüklenemedi. Mevcut verileri değiştirmeden ilerleyebilirsin.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; }; }, [database]);

  const persistStep = async (next: number, completed = false) => { await saveOnboardingState(database, { step: next, completed }); setStep(next); };
  const saveSchedule = async () => {
    setError(null); setSaving(true);
    try {
      const savedTemplates = await listShiftTemplates(database);
      const ownIds = new Set(INITIAL_TEMPLATES.map((item) => item.id));
      const usedCodes = new Set(savedTemplates.filter((item) => !ownIds.has(item.id)).map((item) => item.code.toLocaleUpperCase('en')));
      const safeTemplates = templates.map((item) => {
        const persisted = savedTemplates.find((existing) => existing.id === item.id);
        if (persisted) return { ...item, code: persisted.code };
        const root = item.code; let candidate = root; let suffix = 2;
        while (usedCodes.has(candidate.toLocaleUpperCase('en'))) candidate = `${root}-${suffix++}`;
        usedCodes.add(candidate.toLocaleUpperCase('en'));
        return { ...item, code: candidate };
      });
      setTemplates(safeTemplates);
      const built = buildShiftSchedule({ id: cycleId ?? 'vdy014-onboarding-cycle', name: 'Vardiya düzenim', timezone: 'Europe/Istanbul', anchorLocalDate: anchor,
        pattern, startTemplateIndex: startTemplate, preservedStartEntryIndex, templates: safeTemplates, customEntries: customCycle.map((entry) => entry === null ? { kind: 'OFF' as const } : { kind: 'SHIFT' as const, templateIndex: entry }) });
      await saveShiftSchedule(database, built.templates, built.cycle);
      await persistStep(2);
      setSummary('Vardiya düzenin kaydedildi. Ücret adımını atlayabilirsin; vardiya bilgilerin korunur.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vardiya düzeni kaydedilemedi.'); }
    finally { setSaving(false); }
  };
  const savePay = async (skip: boolean) => {
    setError(null); setSaving(true);
    try {
      if (!skip) {
        const current = await getLatestEarningsProfile<EarningsSettings, ReturnType<typeof createDefaultRules>>(database);
        const currentSettings = current && isEarningsSettings(current.profile) ? current.profile : null;
        const settings = currentSettings ? { ...currentSettings } : createDefaultSettings();
        const nextMode = mode;
        const amount = amountMinor(pay);
        if ((nextMode === 'MONTHLY_GROSS' || nextMode === 'HOURLY_GROSS') && (amount === null || amount < 0)) throw new Error('Seçtiğin ücret türü için geçerli bir tutar gir.');
        const day = Number(periodDay); const hours = Number(weeklyHours);
        if (!Number.isInteger(day) || day < 1 || day > 28 || !Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error('Bordro günü 1–28, haftalık süre 0–168 saat olmalı.');
        const today = getLocalToday(settings.timezone); const effectiveCandidates = getLocalDateTimeCandidates(`${today}T00:00`, settings.timezone);
        if (effectiveCandidates.length !== 1) throw new Error('Ücret başlangıç günü bu zaman diliminde çözümlenemedi.');
        const effective = effectiveCandidates[0];
        const savedRules = earningsRulesForOnboardingSave(currentSettings, current?.rules ?? null, nextMode, effective);
        const payEffectiveFromUtc = earningsPayEffectiveFromOnboardingSave(currentSettings, nextMode,
          nextMode === 'MONTHLY_GROSS' || nextMode === 'HOURLY_GROSS' ? amount : null, effective);
        const next: EarningsSettings = { ...settings, mode: nextMode, monthlyGrossMinor: nextMode === 'MONTHLY_GROSS' ? amount : null,
          hourlyGrossMinor: nextMode === 'HOURLY_GROSS' ? amount : null, payrollPeriodStartDay: day, weeklyMinutes: Math.round(hours * 60),
          payEffectiveFromUtc, rulesEffectiveFromUtc: savedRules.rulesEffectiveFromUtc };
        await appendEarningsProfileVersion(database, 'default', next, savedRules.rules, `onboarding-rules-${Date.now()}`, effective);
      }
      await persistStep(3); setSummary(skip ? 'Ücret adımı atlandı. Daha önce kaydedilen vardiya düzenin korunuyor.' : 'Temel ücret ve dönem tercihlerin kaydedildi.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ücret ayarı kaydedilemedi.'); }
    finally { setSaving(false); }
  };
  const finish = async () => { setSaving(true); try { await persistStep(3, true); router.replace('/(tabs)'); }
    catch { setError('Kurulum tamamlanamadı. Tekrar deneyebilirsin.'); } finally { setSaving(false); } };
  const title = ['Vardiyam’a hoş geldin', 'Vardiya düzenini kur', 'Ücret ve dönem', 'Kurulum özeti'][step] ?? 'Vardiyam’a hoş geldin';
  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kurulum yükleniyor…</Text></View>;
  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
    <View style={styles.top}><View style={[styles.brandIcon, { backgroundColor: theme.accentSurface }]}><Ionicons name={['calendar-clear-outline', 'time-outline', 'wallet-outline', 'checkmark-circle-outline'][step] as never} size={27} color={theme.accent} /></View><Text style={[styles.stepText, { color: theme.muted }]}>ADIM {step + 1} / 4</Text></View>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{step === 0 ? 'Vardiya ve çalışma bilgilerin bu cihazda tutulur. Hesap açman gerekmez.' : step === 1 ? 'Düzenini ve vardiya saatlerini burada kaydet. Ayarlar sayfasına gitmen gerekmez.' : step === 2 ? 'Temel işyeri dönemini ve istersen ücret türünü belirle. Bu adımı atlamak serbesttir.' : summary ?? 'Kurulum hazır.'}</Text>
      {step === 1 ? <>
        <Text style={[styles.label, { color: theme.foreground }]}>Vardiya düzeni</Text><View style={styles.wrap}>{PATTERNS.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: pattern === item.id }} onPress={() => setPattern(item.id)} style={[styles.chip, { borderColor: pattern === item.id ? theme.accent : theme.border, backgroundColor: pattern === item.id ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.title}</Text></Pressable>)}</View>
        <DateTimePickerField mode="date" label="Başlangıç tarihi" value={anchor} timezone="Europe/Istanbul" onChange={setAnchor} onError={setError} />
        <Text style={[styles.label, { color: theme.foreground }]}>Başlangıç vardiyası</Text><View style={styles.wrap}>{templates.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: startTemplate === index }} onPress={() => setStartTemplate(index)} style={[styles.chip, { borderColor: startTemplate === index ? theme.accent : theme.border, backgroundColor: startTemplate === index ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.name}</Text></Pressable>)}</View>
        {templates.map((item, index) => <View key={item.id} style={styles.template}><Text style={[styles.label, { color: theme.foreground }]}>{item.name} vardiyası</Text><View style={styles.timeRow}><DateTimePickerField mode="time" label="Başlangıç" value={item.startLocalTime} timezone="Europe/Istanbul" onChange={(value) => setTemplates((old) => old.map((entry, i) => i === index ? { ...entry, startLocalTime: value } : entry))} onError={setError} /><DateTimePickerField mode="time" label="Bitiş" value={item.endLocalTime} timezone="Europe/Istanbul" onChange={(value) => setTemplates((old) => old.map((entry, i) => i === index ? { ...entry, endLocalTime: value } : entry))} onError={setError} /></View></View>)}
        {pattern === 'custom' ? <View style={styles.template}><Text style={[styles.label, { color: theme.foreground }]}>Özel döngü adımları</Text>{customCycle.map((entry, index) => <View key={`custom-${index}`} style={styles.customRow}><Text style={[styles.label, { color: theme.muted }]}>{index + 1}. gün</Text><View style={styles.wrap}><Pressable accessibilityRole="button" accessibilityState={{ selected: entry === null }} onPress={() => setCustomCycle((current) => current.map((value, i) => i === index ? null : value))} style={[styles.chip, { borderColor: entry === null ? theme.accent : theme.border, backgroundColor: entry === null ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>OFF</Text></Pressable>{templates.map((item, templateIndex) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: entry === templateIndex }} onPress={() => setCustomCycle((current) => current.map((value, i) => i === index ? templateIndex : value))} style={[styles.chip, { borderColor: entry === templateIndex ? theme.accent : theme.border, backgroundColor: entry === templateIndex ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.code}</Text></Pressable>)}</View></View>)}<View style={styles.wrap}><Pressable accessibilityRole="button" disabled={customCycle.length <= 1} onPress={() => setCustomCycle((current) => current.length <= 1 ? current : current.slice(0, -1))} style={[styles.chip, { borderColor: theme.border }]}><Text style={{ color: theme.foreground }}>− Gün</Text></Pressable><Pressable accessibilityRole="button" disabled={customCycle.length >= 14} onPress={() => setCustomCycle((current) => current.length >= 14 ? current : [...current, startTemplate])} style={[styles.chip, { borderColor: theme.border }]}><Text style={{ color: theme.foreground }}>+ Gün ekle</Text></Pressable></View></View> : null}
      </> : null}
      {step === 2 ? <>
        <Text style={[styles.label, { color: theme.foreground }]}>Ücret türü</Text><View style={styles.wrap}>{MODES.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: mode === item.id }} onPress={() => setMode(item.id)} style={[styles.chip, { borderColor: mode === item.id ? theme.accent : theme.border, backgroundColor: mode === item.id ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.title}</Text></Pressable>)}</View>
        {mode === 'MONTHLY_GROSS' || mode === 'HOURLY_GROSS' ? <TextInput accessibilityLabel="Brüt ücret, Türk lirası" keyboardType="decimal-pad" value={pay} onChangeText={setPay} placeholder="Tutar · TL" placeholderTextColor={theme.muted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} /> : null}
        <Text style={[styles.label, { color: theme.foreground }]}>Bordro dönemi başlangıç günü (1–28)</Text><TextInput accessibilityLabel="Bordro dönemi başlangıç günü" keyboardType="number-pad" value={periodDay} onChangeText={setPeriodDay} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} />
        <Text style={[styles.label, { color: theme.foreground }]}>Haftalık sözleşme süresi (saat)</Text><TextInput accessibilityLabel="Haftalık sözleşme saati" keyboardType="decimal-pad" value={weeklyHours} onChangeText={setWeeklyHours} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} />
        <Text style={[styles.body, { color: theme.muted }]}>Bu bilgiler tahmini gösterimler içindir; işyeri kuralları ve yasal haklar yerine geçmez.</Text>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      {saving ? <ActivityIndicator color={theme.accent} /> : null}
      {step === 0 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void persistStep(1).catch(() => setError('Adım kaydedilemedi.'))} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Başlayalım</Text></Pressable> : null}
      {step === 1 ? scheduleCanSave ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveSchedule()} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>{saving ? 'Kaydediliyor…' : 'Vardiyayı kaydet ve devam et'}</Text></Pressable>
        : <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setSummary('Mevcut vardiya düzenin değiştirilmeden korundu.'); void persistStep(2).catch(() => setError('Adım kaydedilemedi.')); }} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Mevcut düzeni koru ve devam et</Text></Pressable> : null}
      {step === 2 ? <><Pressable accessibilityRole="button" disabled={saving || !payCanSave} onPress={() => void savePay(false)} style={[styles.primary, { backgroundColor: theme.primaryAction, opacity: payCanSave ? 1 : 0.55 }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Ayarları kaydet</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void savePay(true)} style={styles.later}><Text style={{ color: theme.muted, fontWeight: '700' }}>Ücret adımını atla</Text></Pressable></> : null}
      {step === 3 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void finish()} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Uygulamaya geç</Text></Pressable> : null}
      {step > 0 && step < 3 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setError(null); setStep(step - 1); void persistStep(step - 1).catch(() => setError('Adım kaydedilemedi.')); }} style={styles.later}><Text style={{ color: theme.muted, fontWeight: '700' }}>Geri</Text></Pressable> : null}
    </View>
    <View style={styles.progress}>{[0, 1, 2, 3].map((index) => <View key={index} style={[styles.dot, { backgroundColor: index <= step ? theme.accent : theme.border }]} />)}</View>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, padding: 20, paddingTop: 44, justifyContent: 'center', gap: 16 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }, top: { gap: 12, alignItems: 'center' }, brandIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, stepText: { fontSize: 11, letterSpacing: 1.3, fontWeight: '800' }, card: { borderWidth: 1, borderRadius: 22, padding: 19, gap: 14 }, title: { fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' }, body: { fontSize: 14, lineHeight: 21, textAlign: 'center' }, label: { fontSize: 13, fontWeight: '800' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, minHeight: 42, justifyContent: 'center' }, template: { gap: 8 }, timeRow: { gap: 8 }, customRow: { gap: 6 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 }, primary: { minHeight: 50, borderRadius: 15, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' }, primaryText: { fontSize: 15, fontWeight: '800' }, later: { minHeight: 42, justifyContent: 'center', alignItems: 'center' }, progress: { flexDirection: 'row', alignSelf: 'center', gap: 8 }, dot: { width: 8, height: 8, borderRadius: 4 } });
