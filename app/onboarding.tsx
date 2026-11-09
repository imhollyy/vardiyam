import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import {
  appendEarningsProfileVersion, getLatestEarningsProfile,
} from '@/src/data/earningsRepository';
import {
  clearOnboardingScheduleDraft, getOnboardingScheduleDraft, getOnboardingState,
  saveOnboardingScheduleDraft, saveOnboardingState,
} from '@/src/data/appPreferencesRepository';
import { listShiftCycles, listShiftTemplates, saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import {
  createDefaultRules, createDefaultSettings, earningsOnboardingDraft,
  earningsPayEffectiveFromOnboardingSave, earningsRulesForOnboardingSave,
  isEarningsSettings, type EarningsSettings,
} from '@/src/features/earnings/profile';
import type { GrossPayMode } from '@/src/domain/earnings';
import { buildShiftSchedule, type ShiftPattern } from '@/src/features/shifts/schedule';
import {
  changesHistoricalPlan, previewNext30Days, requiredTemplateIds,
  ensureScheduleTemplates, scheduleDraftFromCycle, scheduleDraftForBuild, validateSavedScheduleDraft,
  type SavedScheduleDraft,
} from '@/src/features/onboarding/scheduleDraft';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { formatLocalDate, getLocalToday } from '@/src/features/shifts/dates';
import { getLocalDateTimeCandidates } from '@/src/domain/work-record';
import { getNominalShiftWindow, type ShiftTemplate } from '@/src/domain/shift-cycle';

const PATTERNS: { id: ShiftPattern; title: string; example: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'fixed', title: 'Sabit vardiya', example: 'Her gün aynı saatlerde. Hafta içi düzeni değildir.', icon: 'sunny-outline' },
  { id: 'weekly-three', title: 'Haftalık dönüşümlü', example: 'Bir vardiya bir hafta, sonra diğer vardiya.', icon: 'calendar-outline' },
  { id: 'two-two-two', title: '2+2+2', example: 'İkişer gün gündüz, akşam ve gece.', icon: 'repeat-outline' },
  { id: 'four-two', title: '4+2', example: 'Dört vardiya günü, iki OFF günü.', icon: 'moon-outline' },
  { id: 'six-one', title: '6+1', example: 'Altı vardiya günü, bir OFF günü.', icon: 'calendar-number-outline' },
  { id: 'custom', title: 'Özel vardiya düzeni', example: 'Gün gün vardiya ve OFF sırasını seç.', icon: 'options-outline' },
];

const MODES: { id: GrossPayMode; title: string }[] = [
  { id: 'MONTHLY_GROSS', title: 'Aylık brüt' }, { id: 'HOURLY_GROSS', title: 'Saatlik brüt' },
  { id: 'NET_ONLY', title: 'Yalnız net takibi' }, { id: 'SKIP', title: 'Ücret girmeden devam et' },
];

const DEFAULTS: Omit<ShiftTemplate, 'id' | 'code'>[] = [
  { name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
  { name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
];

function newScheduleDraft(): SavedScheduleDraft {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const templates = DEFAULTS.map((template, index) => ({
    ...template, id: `vdy015b-${suffix}-${index}`, code: `V15B-${suffix}-${index}`,
  }));
  return {
    version: 1, pattern: null, anchorLocalDate: getLocalToday('Europe/Istanbul'),
    startTemplateIndex: 0, startEntryIndex: 0, cycleId: `vdy015b-cycle-${suffix}`,
    templates, customEntries: [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }],
    baseline: null, baselinePatternUnknown: false,
  };
}

function toTemplatesForSave(draft: SavedScheduleDraft, existing: readonly ShiftTemplate[]): ShiftTemplate[] {
  const built = buildShiftSchedule(scheduleDraftForBuild(draft));
  const requiredIds = requiredTemplateIds(draft);
  const usedCodes = new Set(existing.filter((item) => !requiredIds.has(item.id)).map((item) => item.code.toLocaleUpperCase('en')));
  return built.templates.filter((template) => requiredIds.has(template.id)).map((template) => {
    const stored = existing.find((item) => item.id === template.id);
    if (stored) return { ...template, code: stored.code };
    let code = template.code;
    let suffix = 2;
    while (usedCodes.has(code.toLocaleUpperCase('en'))) code = `${template.code}-${suffix++}`;
    usedCodes.add(code.toLocaleUpperCase('en'));
    return { ...template, code };
  });
}

function templateIndicesFor(draft: SavedScheduleDraft): number[] {
  if (draft.pattern === 'weekly-three' || draft.pattern === 'two-two-two') return [0, 1, 2].filter((index) => Boolean(draft.templates[index]));
  if (draft.pattern === 'custom') return [...new Set(draft.customEntries.flatMap((entry) => entry.kind === 'SHIFT' ? [entry.templateIndex] : []))];
  return [draft.startTemplateIndex];
}

export default function OnboardingScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleCanSave, setScheduleCanSave] = useState(true);
  const [payCanSave, setPayCanSave] = useState(true);
  const [draft, setDraft] = useState<SavedScheduleDraft>(() => newScheduleDraft());
  const [baselineWarningAccepted, setBaselineWarningAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GrossPayMode>('SKIP');
  const [pay, setPay] = useState('');
  const [periodDay, setPeriodDay] = useState('1');
  const [weeklyHours, setWeeklyHours] = useState('45');
  const [savedPaySignature, setSavedPaySignature] = useState<string | null>(null);
  const [summary, setSummary] = useState('Vardiya takvimin kaydedildi.');

  useEffect(() => {
    let active = true;
    void Promise.all([
      getOnboardingState(database), getOnboardingScheduleDraft<unknown>(database),
      listShiftCycles(database), listShiftTemplates(database),
      getLatestEarningsProfile<EarningsSettings, ReturnType<typeof createDefaultRules>>(database),
    ]).then(async ([state, savedDraft, cycles, storedTemplates, latestProfile]) => {
      if (!active) return;
      let loadedDraft: SavedScheduleDraft;
      if (validateSavedScheduleDraft(savedDraft)) {
        loadedDraft = savedDraft;
      } else if (cycles[0]) {
        loadedDraft = scheduleDraftFromCycle(cycles[0], storedTemplates);
      } else {
        loadedDraft = newScheduleDraft();
      }
      loadedDraft = ensureScheduleTemplates(loadedDraft, storedTemplates);
      setDraft(loadedDraft);

      if (latestProfile && isEarningsSettings(latestProfile.profile)) {
        const settings = latestProfile.profile;
        const payDraft = earningsOnboardingDraft(settings);
        setMode(payDraft.mode); setPay(payDraft.pay); setPeriodDay(payDraft.periodDay); setWeeklyHours(payDraft.weeklyHours);
        setSavedPaySignature(JSON.stringify({ mode: settings.mode, pay: payDraft.pay, periodDay: payDraft.periodDay, weeklyHours: payDraft.weeklyHours }));
      } else if (latestProfile) {
        setPayCanSave(false);
        setError('Kayıtlı ücret ayarı doğrulanamadı. Ücret profilin değiştirilmeden korunacak.');
      }

      // Opening this flow from Settings starts at the beginning with the saved schedule loaded.
      const nextStep = state.completed ? 0 : Math.min(state.step, 6);
      setStep(nextStep);
      if (state.completed) await saveOnboardingState(database, { step: 0, completed: false });
    }).catch(() => {
      if (active) {
        setScheduleCanSave(false);
        setPayCanSave(false);
        setError('Kurulum bilgisi yüklenemedi. Kayıtlı verilerin değiştirilmeden korunuyor.');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [database]);

  const updateDraft = (next: SavedScheduleDraft) => {
    setDraft(next);
    setError(null);
    void saveOnboardingScheduleDraft(database, next).catch(() => setError('Kurulum taslağı bu cihazda kaydedilemedi.'));
  };

  const goTo = async (next: number) => {
    setError(null);
    setSaving(true);
    try {
      await saveOnboardingScheduleDraft(database, draft);
      await saveOnboardingState(database, { step: next, completed: false });
      setStep(next);
      setBaselineWarningAccepted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kurulum adımı kaydedilemedi.');
    } finally { setSaving(false); }
  };

  const continueFromPattern = async () => {
    if (!draft.pattern) { setError('Devam etmek için çalışma düzenini seç.'); return; }
    if (draft.pattern === 'custom' && draft.customEntries.length === 0) { setError('Özel döngüye en az bir gün ekle.'); return; }
    await goTo(2);
  };

  const continueFromTimes = async () => {
    try { buildShiftSchedule(scheduleDraftForBuild(draft)); await goTo(3); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Vardiya saatlerini kontrol et.'); }
  };

  const continueFromStart = async () => {
    try { buildShiftSchedule(scheduleDraftForBuild(draft)); await goTo(4); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Başlangıç düzenini kontrol et.'); }
  };

  const today = getLocalToday('Europe/Istanbul');
  const previewStart = draft.anchorLocalDate > today ? draft.anchorLocalDate : today;
  let preview: ReturnType<typeof previewNext30Days> = [];
  let previewError: string | null = null;
  let historicalChange = false;
  if (step === 4 && draft.pattern) {
    try {
      preview = previewNext30Days(draft, previewStart);
      historicalChange = changesHistoricalPlan(draft, today);
    } catch (cause) { previewError = cause instanceof Error ? cause.message : '30 günlük önizleme oluşturulamadı.'; }
  }

  const updateTime = (index: number, key: 'startLocalTime' | 'endLocalTime', value: string) => {
    updateDraft({ ...draft, templates: draft.templates.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) });
  };

  const saveSchedule = async () => {
    if (!scheduleCanSave) { setError('Mevcut vardiya bilgisi yüklenmeden kayıt yapılamaz.'); return; }
    if (!draft.pattern) { setError('Çalışma düzeni seçilmedi.'); return; }
    if (historicalChange && !baselineWarningAccepted) { setError('Kaydetmeden önce geçmiş plan uyarısını onayla.'); return; }
    setError(null); setSaving(true);
    try {
      const storedTemplates = await listShiftTemplates(database);
      const built = buildShiftSchedule(scheduleDraftForBuild(draft));
      const templatesToSave = toTemplatesForSave(draft, storedTemplates);
      await saveShiftSchedule(database, templatesToSave, built.cycle);
      const nextDraft: SavedScheduleDraft = {
        ...draft,
        baseline: { cycle: { ...built.cycle, entries: built.cycle.entries.map((entry) => ({ ...entry })) }, templates: templatesToSave.map((template) => ({ ...template })) },
        baselinePatternUnknown: false,
      };
      await saveOnboardingScheduleDraft(database, nextDraft);
      await saveOnboardingState(database, { step: 5, completed: false });
      setDraft(nextDraft); setStep(5); setBaselineWarningAccepted(false);
      setSummary('Vardiya takvimin kaydedildi. Ücret ayarını şimdi yapabilir veya atlayabilirsin.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vardiya takvimi kaydedilemedi. Kayıtlı düzen korunuyor; tekrar deneyebilirsin.');
    } finally { setSaving(false); }
  };

  const savePay = async (skip: boolean) => {
    setError(null); setSaving(true);
    try {
      if (!skip) {
        const current = await getLatestEarningsProfile<EarningsSettings, ReturnType<typeof createDefaultRules>>(database);
        const currentSettings = current && isEarningsSettings(current.profile) ? current.profile : null;
        if (current && !currentSettings) throw new Error('Kayıtlı ücret ayarı doğrulanamadı; üzerine yazmadan durdum. Ücret adımını atlayabilirsin.');
        const settings = currentSettings ? { ...currentSettings } : createDefaultSettings();
        const nextMode = mode;
        const amount = (() => {
          if (!/^\d+(?:[.,]\d{1,2})?$/.test(pay.trim())) return null;
          const [whole, fraction = ''] = pay.trim().replace(',', '.').split('.');
          const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
          return Number.isSafeInteger(result) ? result : null;
        })();
        if ((nextMode === 'MONTHLY_GROSS' || nextMode === 'HOURLY_GROSS') && (amount === null || amount < 0)) throw new Error('Seçtiğin ücret türü için geçerli bir tutar gir.');
        const day = Number(periodDay); const hours = Number(weeklyHours);
        if (!Number.isInteger(day) || day < 1 || day > 28 || !Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error('Bordro günü 1–28, haftalık süre 0–168 saat olmalı.');
        const inputSignature = JSON.stringify({ mode: nextMode, pay, periodDay, weeklyHours });
        const unchanged = currentSettings !== null && inputSignature === savedPaySignature;
        if (!unchanged) {
          const todayInZone = getLocalToday(settings.timezone);
          const effectiveCandidates = getLocalDateTimeCandidates(`${todayInZone}T00:00`, settings.timezone);
          if (effectiveCandidates.length !== 1) throw new Error('Ücret başlangıç günü bu zaman diliminde çözümlenemedi.');
          const effective = effectiveCandidates[0]!;
          const savedRules = earningsRulesForOnboardingSave(currentSettings, current?.rules ?? null, nextMode, effective);
          const payEffectiveFromUtc = earningsPayEffectiveFromOnboardingSave(currentSettings, nextMode,
            nextMode === 'MONTHLY_GROSS' || nextMode === 'HOURLY_GROSS' ? amount : null, effective);
          const next: EarningsSettings = {
            ...settings, mode: nextMode,
            monthlyGrossMinor: nextMode === 'MONTHLY_GROSS' ? amount : null,
            hourlyGrossMinor: nextMode === 'HOURLY_GROSS' ? amount : null,
            payrollPeriodStartDay: day, weeklyMinutes: Math.round(hours * 60),
            payEffectiveFromUtc, rulesEffectiveFromUtc: savedRules.rulesEffectiveFromUtc,
          };
          await appendEarningsProfileVersion(database, 'default', next, savedRules.rules, `onboarding-rules-${Date.now()}`, effective);
        }
      }
      await saveOnboardingState(database, { step: 6, completed: false });
      setStep(6);
      setSummary(skip ? 'Ücret adımı atlandı. Kayıtlı ücret profilin değişmedi.' : 'Temel ücret ve dönem tercihlerin kaydedildi.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ücret ayarı kaydedilemedi.');
    } finally { setSaving(false); }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboardingState(database, { step: 6, completed: true });
      await clearOnboardingScheduleDraft(database);
      router.replace('/(tabs)');
    } catch { setError('Kurulum tamamlanamadı. Tekrar deneyebilirsin.'); }
    finally { setSaving(false); }
  };

  const updatePattern = (pattern: ShiftPattern) => {
    let templates = draft.templates;
    if (!draft.baseline && pattern === 'fixed') templates = draft.templates.map((item, index) => index === 0 ? { ...item, name: 'Sabit vardiya' } : item);
    if (!draft.baseline && draft.pattern === 'fixed' && (pattern === 'weekly-three' || pattern === 'two-two-two')) {
      templates = draft.templates.map((item, index) => index === 0 ? { ...item, name: 'Gündüz' } : item);
    }
    const next: SavedScheduleDraft = {
      ...draft, pattern, templates,
      startTemplateIndex: pattern === 'fixed' || pattern === 'four-two' || pattern === 'six-one' ? 0 : draft.startTemplateIndex,
      startEntryIndex: pattern === 'custom' ? Math.min(draft.startEntryIndex, Math.max(draft.customEntries.length - 1, 0)) : 0,
      customEntries: draft.customEntries.length ? draft.customEntries : [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }],
    };
    updateDraft(next);
  };

  const title = ['Vardiyam’a hoş geldin', 'Nasıl çalışıyorsun?', 'Vardiya saatleri', 'Başlangıç günü', 'Önümüzdeki 30 gün', 'Ücret (isteğe bağlı)', 'Takvimin hazır'][step] ?? 'Vardiyam’a hoş geldin';
  const subtitle = [
    'Vardiya düzenini seç, saatlerini ayarla ve takvimini kaydet. Bilgilerin bu cihazda kalır.',
    'Sana en yakın düzeni seçebilirsin. İhtiyacın olursa sonra değiştirebilirsin.',
    'Yalnız seçtiğin düzende kullanılacak vardiyaların saatleri burada görünür.',
    'Döngünün ilk gününü ve gerekiyorsa hangi vardiya fazında başladığını seç.',
    `Döngü başlangıcı ${formatLocalDate(draft.anchorLocalDate)}. Görünüm bugünden${draft.anchorLocalDate > today ? ' seçtiğin ileri başlangıç tarihinden' : ''} başlayarak 30 günü gösterir.`,
    'Ücret bilgisini şimdi girmek zorunda değilsin. Atlamak kayıtlı profilini değiştirmez.',
    summary,
  ][step] ?? summary;

  const goBack = () => { if (step > 0 && step < 5) void goTo(step - 1); };
  const currentTemplateIndices = templateIndicesFor(draft);
  const cycleStartLabel = (index: number) => {
    const entry = draft.customEntries[index];
    return !entry || entry.kind === 'OFF' ? 'Dinlenme günü' : draft.templates[entry.templateIndex]?.name ?? `Vardiya ${entry.templateIndex + 1}`;
  };

  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kurulum yükleniyor…</Text></View>;

  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
    <View style={styles.top}>
      <View style={[styles.brandIcon, { backgroundColor: theme.accentSurface }]}><Ionicons accessible={false} name={['calendar-clear-outline', 'sync-outline', 'time-outline', 'calendar-outline', 'calendar-number-outline', 'wallet-outline', 'checkmark-circle-outline'][step] as never} size={27} color={theme.accent} /></View>
      <Text style={[styles.stepText, { color: theme.muted }]}>ADIM {step + 1} / 7</Text>
    </View>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{subtitle}</Text>

      {step === 0 ? <View style={[styles.info, { backgroundColor: theme.accentSurface }]}>
        <Ionicons accessible={false} name="lock-closed-outline" size={18} color={theme.accent} />
        <Text style={[styles.infoText, { color: theme.foreground }]}>Hesap açmadan başlayabilirsin. Bu adımda ücret bilgisi zorunlu değil.</Text>
      </View> : null}

      {step === 1 ? <>
        {draft.baselinePatternUnknown ? <View style={[styles.info, { backgroundColor: theme.accentSurface }]}><Ionicons accessible={false} name="information-circle-outline" size={18} color={theme.accent} /><Text style={[styles.infoText, { color: theme.foreground }]}>Kayıtlı düzenin özgün adı saklanmamış. Mevcut gün sırasını özel düzen olarak aynen açtım.</Text></View> : null}
        <View style={styles.patternList}>{PATTERNS.map((item) => <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityLabel={`${item.title}. ${item.example}`}
          accessibilityState={{ checked: draft.pattern === item.id }}
          onPress={() => updatePattern(item.id)}
          style={({ pressed }) => [styles.patternCard, { borderColor: draft.pattern === item.id ? theme.accent : theme.border, backgroundColor: draft.pattern === item.id ? theme.accentSurface : theme.surface, opacity: pressed ? 0.82 : 1 }]}
        ><View style={[styles.patternIcon, { backgroundColor: draft.pattern === item.id ? theme.surface : theme.accentSurface }]}><Ionicons accessible={false} name={item.icon} size={20} color={theme.accent} /></View><View style={styles.flex}><Text style={[styles.patternTitle, { color: theme.foreground }]}>{item.title}</Text><Text style={[styles.caption, { color: theme.muted }]}>{item.example}</Text></View><Ionicons accessible={false} name={draft.pattern === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={draft.pattern === item.id ? theme.accent : theme.muted} /></Pressable>)}</View>
        {draft.pattern === 'custom' ? <View style={styles.customEditor}>
          <Text style={[styles.label, { color: theme.foreground }]}>Döngü günleri</Text>
          {draft.customEntries.map((entry, index) => <View key={`custom-${index}`} style={[styles.customLine, { borderColor: theme.border }]}>
            <Text style={[styles.dayIndex, { color: theme.muted }]}>{index + 1}</Text>
            <View style={styles.customChoices}>
              <Pressable accessibilityRole="radio" accessibilityLabel={`${index + 1}. gün: OFF`} accessibilityState={{ checked: entry.kind === 'OFF' }} onPress={() => updateDraft({ ...draft, customEntries: draft.customEntries.map((value, i) => i === index ? { kind: 'OFF' } : value) })} style={[styles.choice, { borderColor: entry.kind === 'OFF' ? theme.accent : theme.border, backgroundColor: entry.kind === 'OFF' ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>OFF</Text></Pressable>
              {draft.templates.map((template, templateIndex) => <Pressable key={template.id} accessibilityRole="radio" accessibilityLabel={`${index + 1}. gün: ${template.name}`} accessibilityState={{ checked: entry.kind === 'SHIFT' && entry.templateIndex === templateIndex }} onPress={() => updateDraft({ ...draft, customEntries: draft.customEntries.map((value, i) => i === index ? { kind: 'SHIFT', templateIndex } : value) })} style={[styles.choice, { borderColor: entry.kind === 'SHIFT' && entry.templateIndex === templateIndex ? theme.accent : theme.border, backgroundColor: entry.kind === 'SHIFT' && entry.templateIndex === templateIndex ? theme.accentSurface : theme.surface }]}><Text numberOfLines={1} style={{ color: theme.foreground }}>{template.name}</Text></Pressable>)}
            </View>
          </View>)}
          <View style={styles.rowButtons}><Pressable accessibilityRole="button" accessibilityLabel="Döngünün son gününü kaldır" disabled={draft.customEntries.length <= 1} onPress={() => updateDraft({ ...draft, customEntries: draft.customEntries.slice(0, -1), startEntryIndex: Math.min(draft.startEntryIndex, draft.customEntries.length - 2) })} style={[styles.secondaryButton, { borderColor: theme.border, opacity: draft.customEntries.length <= 1 ? 0.5 : 1 }]}><Text style={{ color: theme.foreground }}>− Gün</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Döngüye vardiya günü ekle" disabled={draft.customEntries.length >= 14 && !draft.baseline} onPress={() => updateDraft({ ...draft, customEntries: [...draft.customEntries, { kind: 'SHIFT', templateIndex: draft.startTemplateIndex }] })} style={[styles.secondaryButton, { borderColor: theme.border, opacity: draft.customEntries.length >= 14 && !draft.baseline ? 0.5 : 1 }]}><Text style={{ color: theme.foreground }}>+ Gün</Text></Pressable></View>
        </View> : null}
      </> : null}

      {step === 2 ? <>
        {currentTemplateIndices.map((index) => {
          const item = draft.templates[index];
          if (!item) return null;
          let crossesMidnight = false;
          try { crossesMidnight = getNominalShiftWindow(draft.anchorLocalDate, item.startLocalTime, item.endLocalTime).crossesMidnight; } catch { /* Validation appears on continue. */ }
          return <View key={item.id} style={[styles.templateCard, { borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.foreground }]}>{item.name}</Text>
            <View style={styles.timeRow}>
              <DateTimePickerField mode="time" label="Başlangıç" value={item.startLocalTime} timezone="Europe/Istanbul" onChange={(value) => updateTime(index, 'startLocalTime', value)} onError={setError} />
              <DateTimePickerField mode="time" label="Bitiş" value={item.endLocalTime} timezone="Europe/Istanbul" onChange={(value) => updateTime(index, 'endLocalTime', value)} onError={setError} />
            </View>
            {crossesMidnight ? <Text style={[styles.caption, { color: theme.accent }]}>Bitiş ertesi gün {item.endLocalTime}’de</Text> : null}
          </View>;
        })}
        {currentTemplateIndices.length === 0 ? <Text style={[styles.body, { color: theme.danger }]}>Döngüde henüz vardiyalı gün yok. Önce düzenine vardiya ekle.</Text> : null}
      </> : null}

      {step === 3 ? <>
        <DateTimePickerField mode="date" label="Döngünün başlangıç tarihi" value={draft.anchorLocalDate} timezone="Europe/Istanbul" onChange={(value) => updateDraft({ ...draft, anchorLocalDate: value })} onError={setError} />
        {draft.pattern === 'weekly-three' || draft.pattern === 'two-two-two' ? <>
          <Text style={[styles.label, { color: theme.foreground }]}>İlk vardiya</Text>
          <View style={styles.choiceWrap}>{draft.templates.slice(0, 3).map((item, index) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: draft.startTemplateIndex === index }} onPress={() => updateDraft({ ...draft, startTemplateIndex: index })} style={[styles.secondaryButton, { borderColor: draft.startTemplateIndex === index ? theme.accent : theme.border, backgroundColor: draft.startTemplateIndex === index ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.name}</Text></Pressable>)}</View>
        </> : null}
        {draft.pattern === 'custom' ? <>
          <Text style={[styles.label, { color: theme.foreground }]}>Döngünün ilk günü hangi adım?</Text>
          <View style={styles.choiceWrap}>{draft.customEntries.map((_entry, index) => <Pressable key={`start-${index}`} accessibilityRole="radio" accessibilityLabel={`Döngü başlangıcı: ${index + 1}. gün, ${cycleStartLabel(index)}`} accessibilityState={{ checked: draft.startEntryIndex === index }} onPress={() => updateDraft({ ...draft, startEntryIndex: index })} style={[styles.secondaryButton, { borderColor: draft.startEntryIndex === index ? theme.accent : theme.border, backgroundColor: draft.startEntryIndex === index ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{index + 1}. gün · {cycleStartLabel(index)}</Text></Pressable>)}</View>
        </> : null}
        {draft.pattern === 'fixed' ? <Text style={[styles.body, { color: theme.muted }]}>Bu düzen seçilen vardiyayı haftanın tüm günlerine uygular. Hafta içi/hafta sonu ayrımı oluşturmaz.</Text> : null}
      </> : null}

      {step === 4 ? <>
        {draft.pattern === 'fixed' ? <Text style={[styles.caption, { color: theme.accent }]}>Sabit düzen: seçilen vardiya her gün görünür.</Text> : null}
        {historicalChange ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: baselineWarningAccepted }} onPress={() => setBaselineWarningAccepted((value) => !value)} style={[styles.warning, { borderColor: theme.warning, backgroundColor: theme.warningSurface }]}><Ionicons accessible={false} name={baselineWarningAccepted ? 'checkbox' : 'square-outline'} size={22} color={theme.warning} /><Text style={[styles.infoText, { color: theme.foreground }]}>Bu döngü değişikliği geçmiş plan görünümünü de değiştirebilir. Fiilî çalışma kayıtların ve onaylı hesapların etkilenmez. Anladım.</Text></Pressable> : null}
        {previewError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{previewError}</Text> : null}
        {preview.map((day) => {
          const template = day.kind === 'SHIFT' ? draft.templates.find((item) => item.id === day.templateId) : null;
          return <View key={day.localDate} style={[styles.previewRow, { borderColor: theme.border }]}>
            <View style={styles.previewDate}><Text style={[styles.previewDay, { color: theme.foreground }]}>{formatLocalDate(day.localDate, { weekday: 'short', day: 'numeric', month: 'short' })}</Text></View>
            <View style={[styles.kindIcon, { backgroundColor: day.kind === 'SHIFT' ? theme.accentSurface : theme.surface }]}><Ionicons accessible={false} name={day.kind === 'SHIFT' ? 'time-outline' : 'bed-outline'} size={18} color={day.kind === 'SHIFT' ? theme.accent : theme.muted} /></View>
            <View style={styles.flex}><Text style={[styles.previewName, { color: theme.foreground }]}>{day.kind === 'SHIFT' ? template?.name ?? 'Vardiya' : day.kind === 'OFF' ? 'Planlı boş gün' : 'İzin'}</Text><Text style={[styles.caption, { color: theme.muted }]}>{template ? `${template.startLocalTime}–${template.endLocalTime}${template.endLocalTime < template.startLocalTime ? ' · ertesi gün' : ''}` : 'Çalışma planı yok'}</Text></View>
          </View>;
        })}
        {historicalChange && !baselineWarningAccepted ? <Text style={[styles.caption, { color: theme.warning }]}>Kaydetmek için yukarıdaki uyarıyı onayla.</Text> : null}
      </> : null}

      {step === 5 ? <>
        <Text style={[styles.label, { color: theme.foreground }]}>Ücret türü</Text>
        <View style={styles.choiceWrap}>{MODES.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: mode === item.id }} onPress={() => setMode(item.id)} style={[styles.secondaryButton, { borderColor: mode === item.id ? theme.accent : theme.border, backgroundColor: mode === item.id ? theme.accentSurface : theme.surface }]}><Text style={{ color: theme.foreground }}>{item.title}</Text></Pressable>)}</View>
        {mode === 'MONTHLY_GROSS' || mode === 'HOURLY_GROSS' ? <TextInput accessibilityLabel="Brüt ücret, Türk lirası" keyboardType="decimal-pad" value={pay} onChangeText={setPay} placeholder="Tutar · TL" placeholderTextColor={theme.muted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} /> : null}
        <Text style={[styles.label, { color: theme.foreground }]}>Bordro dönemi başlangıç günü (1–28)</Text><TextInput accessibilityLabel="Bordro dönemi başlangıç günü" keyboardType="number-pad" value={periodDay} onChangeText={setPeriodDay} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} />
        <Text style={[styles.label, { color: theme.foreground }]}>Haftalık sözleşme süresi (saat)</Text><TextInput accessibilityLabel="Haftalık sözleşme süresi" keyboardType="decimal-pad" value={weeklyHours} onChangeText={setWeeklyHours} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} />
        <Text style={[styles.caption, { color: theme.muted }]}>İşyeri kurallarını daha sonra Ayarlar’dan düzenleyebilirsin.</Text>
      </> : null}

      {step === 6 ? <View style={[styles.info, { backgroundColor: theme.accentSurface }]}><Ionicons accessible={false} name="checkmark-circle-outline" size={22} color={theme.accent} /><Text style={[styles.infoText, { color: theme.foreground }]}>{summary}</Text></View> : null}

      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      {saving ? <View accessibilityLiveRegion="polite" style={styles.saving}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kaydediliyor…</Text></View> : null}

      {step === 0 ? <PrimaryButton title="Başlayalım" disabled={saving} onPress={() => void goTo(1)} /> : null}
      {step === 1 ? <PrimaryButton title="Devam et" disabled={saving || !scheduleCanSave || !draft.pattern} onPress={() => void continueFromPattern()} /> : null}
      {step === 2 ? <PrimaryButton title="Başlangıç gününü seç" disabled={saving || !scheduleCanSave || currentTemplateIndices.length === 0} onPress={() => void continueFromTimes()} /> : null}
      {step === 3 ? <PrimaryButton title="30 günlük önizlemeyi gör" disabled={saving || !scheduleCanSave} onPress={() => void continueFromStart()} /> : null}
      {step === 4 ? <PrimaryButton title="Onayla ve takvimi kaydet" disabled={saving || !scheduleCanSave || Boolean(previewError) || preview.length !== 30 || (historicalChange && !baselineWarningAccepted)} onPress={() => void saveSchedule()} /> : null}
      {step === 5 ? <>
        <PrimaryButton title="Ücret ayarını kaydet" disabled={saving || !payCanSave} onPress={() => void savePay(false)} />
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void savePay(true)} style={styles.skip}><Text style={{ color: theme.muted, fontWeight: '700' }}>Ücret adımını atla</Text></Pressable>
      </> : null}
      {step === 6 ? <PrimaryButton title="Takvime geç" disabled={saving} onPress={() => void finish()} /> : null}
      {step > 0 && step < 5 ? <Pressable accessibilityRole="button" disabled={saving} onPress={goBack} style={styles.back}><Text style={{ color: theme.muted, fontWeight: '700' }}>Geri</Text></Pressable> : null}
      {step === 5 ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void goTo(4)} style={styles.back}><Text style={{ color: theme.muted, fontWeight: '700' }}>Önizlemeye dön</Text></Pressable> : null}
    </View>
    <View accessibilityLabel={`Kurulum adımı ${step + 1}, toplam 7`} style={styles.progress}>{Array.from({ length: 7 }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: index <= step ? theme.accent : theme.border }]} />)}</View>
  </ScrollView>;
}

function PrimaryButton({ title, disabled, onPress }: { title: string; disabled: boolean; onPress: () => void }) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: theme.primaryAction, opacity: disabled ? 0.55 : pressed ? 0.82 : 1 }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, paddingTop: 34, paddingBottom: 32, justifyContent: 'center', gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  top: { gap: 10, alignItems: 'center' },
  brandIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 14 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  caption: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  info: { borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  patternList: { gap: 8 },
  patternCard: { minHeight: 72, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  patternIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  patternTitle: { fontSize: 14, fontWeight: '800' },
  customEditor: { gap: 9 },
  customLine: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayIndex: { width: 25, fontWeight: '800' },
  customChoices: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 44, minWidth: 62, maxWidth: 145, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  rowButtons: { flexDirection: 'row', gap: 8 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 9 },
  timeRow: { gap: 8 },
  previewRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewDate: { width: 72 },
  previewDay: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  kindIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 13, fontWeight: '800' },
  warning: { borderWidth: 1, borderRadius: 13, padding: 11, flexDirection: 'row', gap: 9, alignItems: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  primary: { minHeight: 50, borderRadius: 15, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  skip: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  back: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  saving: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  progress: { flexDirection: 'row', alignSelf: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
