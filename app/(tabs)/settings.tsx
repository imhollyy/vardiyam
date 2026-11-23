import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAppDatabase, useNotifyDataReset } from '@/src/data/AppDatabaseProvider';
import { ChoiceChip } from '@/src/components/ui/ChoiceChip';

import { ShiftKindBadge } from '@/src/components/shifts/ShiftKindBadge';
import {
  getNominalShiftWindow,
  type ShiftCycle,
  type ShiftTemplate,
} from '@/src/domain/shift-cycle/index';
import {
  listShiftCycles,
  listShiftTemplates,
  saveShiftSchedule,
} from '@/src/data/shiftCycleRepository';
import { getLocalToday } from '@/src/features/shifts/dates';
import {
  buildShiftSchedule,
  previewShiftSchedule,
  type CustomEntryDraft,
  type ScheduleDraft,
  type ShiftPattern,
} from '@/src/features/shifts/schedule';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import type { Settings } from '@/src/domain/payroll/types';
import { formatTryMinor, parseTryMinor } from '@/src/domain/money';
import { fonts, layout } from '@/src/theme/tokens';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { ActionButton } from '@/src/components/ui/ActionButton';

const PATTERNS: { id: ShiftPattern; title: string; hint: string }[] = [
  { id: 'fixed', title: 'Sabit', hint: 'Her gün seçilen vardiya' },
  { id: 'weekly-three', title: 'Haftalık 3 vardiya', hint: 'Vardiya başına 7 gün' },
  { id: 'two-two-two', title: '2+2+2', hint: 'İkişer gün dönüşüm' },
  { id: 'four-two', title: '4+2', hint: 'Dört vardiya, iki OFF' },
  { id: 'six-one', title: '6+1', hint: 'Altı vardiya, bir OFF' },
  { id: 'custom', title: 'Özel', hint: 'Gün gün düzenle' },
];

const DEFAULT_TEMPLATE_VALUES = [
  { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00', breakMinutes: 30 },
  { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00', breakMinutes: 30 },
  { code: 'N', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00', breakMinutes: 30 },
];

type Theme = ReturnType<typeof useAppTheme>['theme'];

function createDefaults(id = `cycle-${Date.now()}`): ScheduleDraft {
  const templates = DEFAULT_TEMPLATE_VALUES.map((template, index) => ({
    id: `${id}-template-${index}`,
    ...template,
  }));
  return {
    id,
    name: 'Vardiya düzenim',
    timezone: 'Europe/Istanbul',
    anchorLocalDate: getLocalToday('Europe/Istanbul'),
    pattern: 'two-two-two',
    startTemplateIndex: 0,
    templates,
    customEntries: [
      { kind: 'SHIFT', templateIndex: 0 },
      { kind: 'SHIFT', templateIndex: 0 },
      { kind: 'SHIFT', templateIndex: 1 },
      { kind: 'SHIFT', templateIndex: 1 },
      { kind: 'SHIFT', templateIndex: 2 },
      { kind: 'SHIFT', templateIndex: 2 },
    ],
  };
}

function sameTemplateRun(entries: ShiftCycle['entries'], start: number, end: number): boolean {
  const first = entries[start];
  return first?.kind === 'SHIFT' && entries.slice(start, end).every(
    (entry) => entry.kind === 'SHIFT' && entry.templateId === first.templateId,
  );
}

function detectPattern(cycle: ShiftCycle): ShiftPattern {
  const entries = cycle.entries;
  if (entries.length === 1) return 'fixed';
  if (
    entries.length === 21 && sameTemplateRun(entries, 0, 7) &&
    sameTemplateRun(entries, 7, 14) && sameTemplateRun(entries, 14, 21)
  ) return 'weekly-three';
  if (entries.length === 6 && [0, 2, 4].every((index) => sameTemplateRun(entries, index, index + 2))) {
    return 'two-two-two';
  }
  if (
    entries.length === 6 && sameTemplateRun(entries, 0, 4) &&
    entries.slice(4).every((entry) => entry.kind === 'OFF')
  ) return 'four-two';
  if (
    entries.length === 7 && sameTemplateRun(entries, 0, 6) && entries[6].kind === 'OFF'
  ) return 'six-one';
  return 'custom';
}

function draftFromSaved(cycle: ShiftCycle, storedTemplates: ShiftTemplate[]): ScheduleDraft {
  const defaults = createDefaults(cycle.id);
  const cycleTemplateIds = [...new Set(cycle.entries.flatMap((entry) => entry.kind === 'SHIFT' ? [entry.templateId] : []))];
  const cycleTemplates = cycleTemplateIds
    .map((id) => storedTemplates.find((template) => template.id === id))
    .filter((template): template is ShiftTemplate => Boolean(template));
  const templates = [...cycleTemplates];
  for (const template of storedTemplates) {
    if (templates.length >= 3) break;
    if (!templates.some((candidate) => candidate.id === template.id)) templates.push(template);
  }
  for (const template of defaults.templates) {
    if (templates.length >= 3) break;
    templates.push(template);
  }
  const anchorEntry = cycle.entries[cycle.startIndex];
  const anchorTemplateId = anchorEntry?.kind === 'SHIFT'
    ? anchorEntry.templateId
    : cycle.entries.find((entry) => entry.kind === 'SHIFT')?.templateId;
  const startTemplateIndex = Math.max(0, templates.findIndex((template) => template.id === anchorTemplateId));
  return {
    id: cycle.id,
    name: cycle.name,
    timezone: cycle.timezone,
    anchorLocalDate: cycle.anchorLocalDate,
    pattern: detectPattern(cycle),
    startTemplateIndex,
    preservedStartEntryIndex: cycle.startIndex,
    templates,
    customEntries: cycle.entries.map((entry): CustomEntryDraft =>
      entry.kind === 'OFF'
        ? { kind: 'OFF' }
        : { kind: 'SHIFT', templateIndex: Math.max(0, templates.findIndex((template) => template.id === entry.templateId)) },
    ),
  };
}

function Field({
  label, value, onChangeText, theme, placeholder, keyboardType = 'default', maxLength,
}: {
  label: string; value: string; onChangeText: (value: string) => void; theme: Theme;
  placeholder?: string; keyboardType?: 'default' | 'numbers-and-punctuation'; maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label} autoCapitalize="none" keyboardType={keyboardType} maxLength={maxLength}
        onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.muted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink, fontFamily: fonts.medium }]} value={value}
      />
    </View>
  );
}

function Action({ label, onPress, theme, secondary = false, disabled = false, accessibilityLabel }: {
  label: string; onPress: () => void; theme: Theme; secondary?: boolean; disabled?: boolean; accessibilityLabel?: string;
}) {
  void theme;
  return <ActionButton label={label} accessibilityLabel={accessibilityLabel} onPress={onPress} variant={secondary ? 'secondary' : 'primary'} disabled={disabled} />;
}


function SectionHeading({ icon, title, theme }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; theme: Theme }) {
  return <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: theme.surfaceMuted }]}><Ionicons name={icon} size={18} color={theme.ink} /></View><Text style={[styles.sectionTitle, { color: theme.ink }]}>{title}</Text></View>;
}

export default function SettingsScreen() {
  const database = useAppDatabase();
  const notifyDataReset = useNotifyDataReset();
  const router = useRouter();
  const { theme, mode, toggleMode } = useAppTheme();
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [storedTemplates, setStoredTemplates] = useState<ShiftTemplate[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>(() => createDefaults());
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryRaw, setSalaryRaw] = useState('');
  const [salaryTypeEdit, setSalaryTypeEdit] = useState<'GROSS' | 'NET'>('GROSS');
  const [paydayRaw, setPaydayRaw] = useState('');
  const [besEnabledEdit, setBesEnabledEdit] = useState(false);
  const [besRateBpRaw, setBesRateBpRaw] = useState('3');
  const [savingSalary, setSavingSalary] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const loadedOnce = useRef(false);
  const startEntry = cycle?.entries[cycle.startIndex];

  useEffect(() => { loadedOnce.current = false; }, [database]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, templates, settings] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
        getSettings(database),
      ]);
      const active = cycles[0] ?? null;
      setCycle(active);
      setStoredTemplates(templates);
      setAppSettings(settings);
      if (active) { setDraft(draftFromSaved(active, templates)); setEditing(false); }
      else { setDraft(createDefaults()); setEditing(true); }
    } catch {
      setError('Ayarlar yüklenemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]));

  const preview = useMemo(() => {
    try { return previewShiftSchedule(draft, draft.anchorLocalDate, 14); }
    catch { return []; }
  }, [draft]);

  const startTemplateOptions = draft.templates
    .map((template, index) => ({ template, index }))
    .filter(({ index }) => draft.pattern !== 'custom' || draft.customEntries.some(
      (entry) => entry.kind === 'SHIFT' && entry.templateIndex === index,
    ));

  const updateTemplate = (index: number, update: Partial<ShiftTemplate>) => {
    setDraft((current) => ({
      ...current,
      templates: current.templates.map((template, candidate) =>
        candidate === index ? { ...template, ...update } : template,
      ),
    }));
  };

  const save = async () => {
    setSuccess(null); setError(null);
    let built;
    try { built = buildShiftSchedule(draft); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Bilgileri kontrol edin.'); return; }
    setSaving(true);
    try {
      await saveShiftSchedule(database, built.templates, built.cycle);
      setCycle(built.cycle); setStoredTemplates(built.templates);
      setDraft({ ...draft, templates: built.templates }); setEditing(false);
      setSuccess('Vardiya düzeni kaydedildi.');
    } catch { setError('Kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const cancelEdit = () => {
    if (cycle) setDraft(draftFromSaved(cycle, storedTemplates));
    else setDraft(createDefaults());
    setEditing(false); setError(null);
  };

  const confirmCancelEdit = () => {
    Alert.alert('Düzenlemeyi bırak?', 'Kaydedilmemiş değişiklikler kaybolacak.',
      [{ text: 'Düzenlemeye dön', style: 'cancel' }, { text: 'Vazgeç', style: 'destructive', onPress: cancelEdit }]);
  };

  const choosePattern = (pattern: ShiftPattern) => {
    setDraft((current) => ({
      ...current, pattern, preservedStartEntryIndex: undefined,
      customEntries: pattern === 'custom' && current.customEntries.length === 0
        ? [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }] : current.customEntries,
    }));
  };

  const updateCustomEntry = (entryIndex: number, value: CustomEntryDraft) => {
    setDraft((current) => ({
      ...current, customEntries: current.customEntries.map((entry, index) => index === entryIndex ? value : entry),
    }));
  };

  const startSalaryEdit = () => {
    if (!appSettings) return;
    setSalaryRaw((appSettings.salaryMinor / 100).toFixed(2));
    setSalaryTypeEdit(appSettings.salaryType);
    setPaydayRaw(appSettings.payday === 'LAST' ? '' : String(appSettings.payday));
    setBesEnabledEdit(appSettings.besEnabled);
    setBesRateBpRaw(String(appSettings.besRateBp / 100));
    setEditingSalary(true);
    setError(null);
  };

  const cancelSalaryEdit = () => { setEditingSalary(false); setError(null); };

  const saveSalaryEdit = async () => {
    let salaryMinor: number;
    try { salaryMinor = parseTryMinor(salaryRaw); } catch { setError('Maaş tutarı geçersiz.'); return; }
    const paydayNum = paydayRaw.trim() === '' ? undefined : Number(paydayRaw.trim());
    if (paydayRaw.trim() !== '' && (isNaN(paydayNum!) || paydayNum! < 1 || paydayNum! > 31)) {
      setError('Maaş günü 1–31 arasında olmalı veya boş bırakın (ayın sonu).'); return;
    }
    const payday = (paydayRaw.trim() === '' ? 'LAST' : String(paydayNum!)) as Settings['payday'];
    const besRateBp = Math.round(Number(besRateBpRaw) * 100);
    if (besEnabledEdit && (isNaN(besRateBp) || besRateBp < 100 || besRateBp > 2500)) {
      setError('BES oranı %1–%25 arasında olmalı.'); return;
    }
    setSavingSalary(true); setError(null);
    try {
      await updateSettings(database, { salaryMinor, salaryType: salaryTypeEdit, payday, besEnabled: besEnabledEdit, besRateBp: besEnabledEdit ? besRateBp : appSettings?.besRateBp ?? 300 });
      const updated = await getSettings(database);
      setAppSettings(updated);
      setEditingSalary(false);
      setSuccess('Ücret bilgileri güncellendi.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
    finally { setSavingSalary(false); }
  };

  const handleReset = () => { setResetConfirmText(''); setShowResetModal(true); };

  const confirmReset = async () => {
    setShowResetModal(false);
    try {
      const { resetAllData, cleanupLocalArtifacts } = await import('@/src/data/resetRepository');
      await resetAllData(database);
      await cleanupLocalArtifacts();
      notifyDataReset();
      router.replace('/welcome');
    } catch (err) {
      Alert.alert('Sıfırlama başarısız', err instanceof Error ? err.message : 'Veriler korundu.');
    }
  };

  const renderCyclePreview = (items: typeof preview) => (
    <View style={styles.previewWrap}>
      {items.map((item) => {
        const template = item.kind === 'SHIFT' ? draft.templates.find((c) => c.id === item.templateId) : undefined;
        const window = template ? getNominalShiftWindow(item.localDate, template.startLocalTime, template.endLocalTime) : null;
        return (
          <View key={item.localDate} style={[styles.previewDay, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.previewDate, { color: theme.muted }]}>{item.localDate.slice(5)}</Text>
            <ShiftKindBadge compact kind={item.kind} template={template} />
            {window ? <Text style={[styles.previewTime, { color: theme.muted }]}>{window.startLocalTime}–{window.endLocalTime}{window.crossesMidnight ? ' +1' : ''}</Text> : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <>
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
      <PageHeading eyebrow="TERCİHLER" title="Ayarlar" subtitle="Vardiya düzenin ve ücret ayarların cihazında saklanır." />

      {/* Quick actions */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="color-palette-outline" title="Görünüm ve hızlı erişim" theme={theme} />
        <Action label={mode === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} onPress={() => void toggleMode()} theme={theme} secondary />
        <Action label="Vardiya değişikliği" onPress={() => router.push('/shift-change' as never)} theme={theme} secondary />
        <Action label="Ek gelirler" onPress={() => router.push('/additional-income' as never)} theme={theme} secondary />
      </View>

      {/* Payroll summary / edit */}
      {appSettings && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SectionHeading icon="wallet-outline" title="Ücret bilgileri" theme={theme} />
          {editingSalary ? (
            <>
              <Field label="Maaş (TL)" value={salaryRaw} onChangeText={setSalaryRaw} theme={theme} placeholder="Örn. 25000.00" keyboardType="numbers-and-punctuation" />
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>Maaş türü</Text>
              <View style={styles.chipWrap}>
                {(['GROSS', 'NET'] as const).map((type) => (
                  <ChoiceChip key={type} label={type === 'GROSS' ? 'Brüt' : 'Net'} selected={salaryTypeEdit === type} onPress={() => setSalaryTypeEdit(type)} />
                ))}
              </View>
              <Field label="Maaş günü (1–31, boş = ayın sonu)" value={paydayRaw} onChangeText={setPaydayRaw} theme={theme} placeholder="Boş = ayın sonu" keyboardType="numbers-and-punctuation" maxLength={2} />
              <View style={styles.infoRow}>
                <Text style={[styles.fieldLabel, { color: theme.muted }]}>BES aktif</Text>
                <Switch value={besEnabledEdit} onValueChange={setBesEnabledEdit} trackColor={{ true: theme.accent }} />
              </View>
              {besEnabledEdit && (
                <Field label="BES oranı (%)" value={besRateBpRaw} onChangeText={setBesRateBpRaw} theme={theme} placeholder="Örn. 3" keyboardType="numbers-and-punctuation" maxLength={4} />
              )}
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Action label={savingSalary ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void saveSalaryEdit()} theme={theme} disabled={savingSalary} />
                <Action label="Vazgeç" onPress={cancelSalaryEdit} theme={theme} secondary disabled={savingSalary} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted }}>Maaş</Text>
                <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{formatTryMinor(appSettings.salaryMinor)} ({appSettings.salaryType === 'GROSS' ? 'Brüt' : 'Net'})</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted }}>Maaş günü</Text>
                <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{appSettings.payday === 'LAST' ? 'Ayın sonu' : `Ayın ${appSettings.payday}`}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted }}>BES</Text>
                <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{appSettings.besEnabled ? `%${(appSettings.besRateBp / 100).toFixed(0)}` : 'Kapalı'}</Text>
              </View>
              {success ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{success}</Text> : null}
              <Action label="Ücret bilgilerini düzenle" onPress={startSalaryEdit} theme={theme} secondary />
            </>
          )}
        </View>
      )}

      {/* Data */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="shield-checkmark-outline" title="Veri güvenliği" theme={theme} />
        <Action label="Yedekleme ve geri yükleme" onPress={() => router.push('/backup' as never)} theme={theme} />
      </View>

      {/* Legal */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="document-text-outline" title="Yasal" theme={theme} />
        <Action label="KVKK Aydınlatma Metni" onPress={() => router.push('/legal/kvkk' as never)} theme={theme} secondary />
        <Action label="Gizlilik Politikası" onPress={() => router.push('/legal/privacy' as never)} theme={theme} secondary />
      </View>

      {/* Shift cycle editor */}
      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <ActivityIndicator color={theme.ink} />
          <Text style={{ color: theme.muted }}>Vardiya düzeni yükleniyor…</Text>
        </View>
      ) : error && !editing ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="alert" style={[styles.body, { color: theme.ink }]}>{error}</Text>
          <Action label="Tekrar dene" onPress={() => void load()} theme={theme} />
        </View>
      ) : !editing && cycle ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>{cycle.name}</Text>
              <Text style={[styles.body, { color: theme.muted }]}>{PATTERNS.find((item) => item.id === detectPattern(cycle))?.title} · {cycle.timezone}</Text>
            </View>
            {startEntry?.kind === 'SHIFT' ? <ShiftKindBadge kind="SHIFT" template={storedTemplates.find((item) => item.id === startEntry.templateId)} /> : null}
          </View>
          <Action label="Düzeni düzenle" onPress={() => setEditing(true)} theme={theme} />
          {success ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{success}</Text> : null}
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeading icon="repeat-outline" title="Döngü bilgileri" theme={theme} />
            <Field label="Düzen adı" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} theme={theme} placeholder="Örn. Üretim vardiyam" />
            <Field label="Zaman dilimi (IANA)" value={draft.timezone} onChangeText={(timezone) => setDraft({ ...draft, timezone })} theme={theme} placeholder="Europe/Istanbul" />
            <DateTimePickerField mode="date" label="Döngü başlangıç tarihi" value={draft.anchorLocalDate} timezone={draft.timezone} onChange={(anchorLocalDate) => setDraft({ ...draft, anchorLocalDate })} onError={setError} />
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>Düzen türü</Text>
            <View style={styles.chipWrap}>
              {PATTERNS.map((item) => <ChoiceChip key={item.id} label={item.title} description={item.hint} selected={draft.pattern === item.id} onPress={() => choosePattern(item.id)} />)}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeading icon="time-outline" title="Vardiya şablonları" theme={theme} />
            {draft.templates.map((template, index) => (
              <View key={template.id} style={[styles.templateBox, { borderColor: theme.border }]}>
                <View style={styles.twoColumns}>
                  <View style={styles.flex}><Field label={`Ad ${index + 1}`} value={template.name} onChangeText={(name) => updateTemplate(index, { name })} theme={theme} /></View>
                  <View style={styles.codeField}><Field label={`Kod ${index + 1}`} value={template.code} onChangeText={(code) => updateTemplate(index, { code: code.toLocaleUpperCase('tr-TR') })} theme={theme} maxLength={5} /></View>
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.flex}><DateTimePickerField mode="time" label={`Başlangıç ${index + 1}`} value={template.startLocalTime} localDate={draft.anchorLocalDate} timezone={draft.timezone} onChange={(startLocalTime) => updateTemplate(index, { startLocalTime })} onError={setError} /></View>
                  <View style={styles.flex}><DateTimePickerField mode="time" label={`Bitiş ${index + 1}`} value={template.endLocalTime} localDate={draft.anchorLocalDate} timezone={draft.timezone} onChange={(endLocalTime) => updateTemplate(index, { endLocalTime })} onError={setError} /></View>
                </View>
              </View>
            ))}
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>Başlangıç vardiyası</Text>
            <View style={styles.chipWrap}>
              {startTemplateOptions.map(({ template, index }) => (
                <ChoiceChip key={template.id} label={`${template.code || `V${index + 1}`} · ${template.name || `V${index + 1}`}`} selected={draft.startTemplateIndex === index} onPress={() => setDraft({ ...draft, startTemplateIndex: index, preservedStartEntryIndex: undefined })} />
              ))}
            </View>
            {draft.pattern === 'custom' ? (
              <View>
                {draft.customEntries.map((entry, index) => (
                  <View key={`custom-${index}`} style={[styles.customRow, { borderColor: theme.border }]}>
                    <Text style={[styles.customDay, { color: theme.muted }]}>{index + 1}. gün</Text>
                    <View style={styles.customControls}>
                      <ChoiceChip label="Vardiya" selected={entry.kind === 'SHIFT'} onPress={() => updateCustomEntry(index, { kind: 'SHIFT', templateIndex: entry.kind === 'SHIFT' ? entry.templateIndex : draft.startTemplateIndex })} />
                      <ChoiceChip label="OFF" selected={entry.kind === 'OFF'} onPress={() => updateCustomEntry(index, { kind: 'OFF' })} />
                      {entry.kind === 'SHIFT' ? draft.templates.map((t, ti) => <ChoiceChip key={t.id} label={t.code || `V${ti + 1}`} selected={entry.templateIndex === ti} onPress={() => updateCustomEntry(index, { kind: 'SHIFT', templateIndex: ti })} />) : null}
                    </View>
                    <Pressable accessibilityLabel={`${index + 1}. günü kaldır`} accessibilityRole="button" hitSlop={8} onPress={() => setDraft({ ...draft, customEntries: draft.customEntries.filter((_, c) => c !== index) })} style={styles.removeEntry}>
                      <Text style={{ color: theme.muted, fontSize: 14 }}>Kaldır</Text>
                    </Pressable>
                  </View>
                ))}
                <Action label="Gün ekle" onPress={() => setDraft({ ...draft, customEntries: [...draft.customEntries, { kind: 'OFF' }] })} theme={theme} secondary disabled={draft.customEntries.length >= 14} />
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeading icon="calendar-outline" title="14 günlük önizleme" theme={theme} />
            {preview.length ? renderCyclePreview(preview) : <Text style={{ color: theme.muted }}>Bilgileri kontrol et.</Text>}
          </View>

          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <Action label={saving ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void save()} theme={theme} disabled={saving} />
            {cycle ? <Action label="Vazgeç" onPress={confirmCancelEdit} theme={theme} secondary disabled={saving} /> : null}
          </View>
        </>
      )}

      {/* Reset */}
      <View style={[styles.card, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
        <SectionHeading icon="trash-outline" title="Sıfırla" theme={theme} />
        <Text style={[styles.body, { color: theme.ink }]}>Tüm verilerini sil ve uygulamayı baştan kur.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={handleReset}
          style={[styles.dangerButton, { borderColor: theme.danger }]}
        >
          <Text style={{ color: theme.danger, fontFamily: fonts.bold, fontSize: layout.type.body }}>SIFIRLA</Text>
        </Pressable>
      </View>
    </ScrollView>

    <Modal animationType="fade" transparent visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.modalTitle, { color: theme.ink }]}>Tüm verileri sil</Text>
          <Text style={[styles.body, { color: theme.muted }]}>Bu işlem geri alınamaz. Onaylamak için aşağıya{' '}
            <Text style={{ fontFamily: fonts.extraBold, color: theme.danger }}>SIFIRLA</Text>
            {' '}yazın.</Text>
          <TextInput
            accessibilityLabel="Onay metni"
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setResetConfirmText}
            placeholder="SIFIRLA"
            placeholderTextColor={theme.muted}
            style={[styles.input, { backgroundColor: theme.background, borderColor: resetConfirmText === 'SIFIRLA' ? theme.danger : theme.border, color: theme.ink }]}
            value={resetConfirmText}
          />
          <Pressable
            accessibilityLabel="Sıfırlamayı onayla"
            accessibilityRole="button"
            disabled={resetConfirmText !== 'SIFIRLA'}
            onPress={() => void confirmReset()}
            style={[styles.dangerButton, { borderColor: theme.danger, opacity: resetConfirmText === 'SIFIRLA' ? 1 : 0.35 }]}
          >
            <Text style={{ color: theme.danger, fontFamily: fonts.bold, fontSize: layout.type.body }}>Onayla ve sıfırla</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowResetModal(false)} style={styles.modalCancel}>
            <Text style={{ color: theme.muted, fontSize: layout.type.body }}>İptal</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 16 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.section, flexShrink: 1 },
  cardTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.heading },
  body: { fontFamily: fonts.regular, fontSize: layout.type.body, lineHeight: 22 },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fonts.bold, marginTop: 2, fontSize: layout.type.caption },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: layout.type.body },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  codeField: { width: 92 },
  customRow: { borderTopWidth: 1, paddingVertical: 10, gap: 8 },
  customDay: { fontSize: 13, fontFamily: fonts.bold },
  customControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  removeEntry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  previewWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewDay: { minWidth: 125, flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 12, padding: 8, gap: 5 },
  previewDate: { fontSize: 12, fontFamily: fonts.bold },
  previewTime: { fontSize: 12 },
  actionRow: { gap: 10 },
  statusRow: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { fontFamily: fonts.bold, fontSize: layout.type.caption, lineHeight: 20 },
  success: { fontFamily: fonts.bold, fontSize: layout.type.caption, lineHeight: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dangerButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
  modalSheet: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.heading },
  modalCancel: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
