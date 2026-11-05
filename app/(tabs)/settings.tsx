import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';

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
import { colors } from '@/src/theme/tokens';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { saveOnboardingState } from '@/src/data/appPreferencesRepository';
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
  { code: 'G', name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { code: 'A', name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
  { code: 'N', name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
];

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];

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
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  keyboardType = 'default',
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: Theme;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]}
        value={value}
      />
    </View>
  );
}

function Action({
  label,
  onPress,
  theme,
  secondary = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  void theme;
  return <ActionButton label={label} accessibilityLabel={accessibilityLabel} onPress={onPress} variant={secondary ? 'secondary' : 'primary'} disabled={disabled} />;
}

function Chip({ label, selected, onPress, theme, accessibilityLabel }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, {
        backgroundColor: selected ? theme.accentSurface : theme.surface,
        borderColor: selected ? theme.accent : theme.border,
        opacity: pressed ? 0.72 : 1,
      }]}
    >
      <Text style={{ color: selected ? theme.accent : theme.foreground, fontSize: 14, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const database = useAppDatabase();
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
  const loadedOnce = useRef(false);
  const startEntry = cycle?.entries[cycle.startIndex];

  useEffect(() => { loadedOnce.current = false; }, [database]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, templates] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
      ]);
      const active = cycles[0] ?? null;
      setCycle(active);
      setStoredTemplates(templates);
      if (active) {
        setDraft(draftFromSaved(active, templates));
        setEditing(false);
      } else {
        setDraft(createDefaults());
        setEditing(true);
      }
    } catch {
      setError('Vardiya düzeni yüklenemedi. Tekrar deneyin.');
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
    try {
      return previewShiftSchedule(draft, draft.anchorLocalDate, 14);
    } catch {
      return [];
    }
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
    setSuccess(null);
    setError(null);
    let built;
    try {
      built = buildShiftSchedule(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vardiya düzeni bilgilerini kontrol edin.');
      return;
    }

    setSaving(true);
    try {
      await saveShiftSchedule(database, built.templates, built.cycle);
      setCycle(built.cycle);
      setStoredTemplates(built.templates);
      setDraft({ ...draft, templates: built.templates });
      setEditing(false);
      setSuccess('Vardiya düzeni cihazına kaydedildi.');
    } catch {
      setError('Vardiya düzeni kaydedilemedi. Kodların benzersiz ve saatlerin geçerli olduğundan emin olun.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (cycle) setDraft(draftFromSaved(cycle, storedTemplates));
    else setDraft(createDefaults());
    setEditing(false);
    setError(null);
  };

  const confirmCancelEdit = () => {
    Alert.alert(
      'Düzenlemeyi bırak?',
      'Kaydedilmemiş değişiklikler kaybolacak. Kayıtlı vardiya planın korunur.',
      [
        { text: 'Düzenlemeye dön', style: 'cancel' },
        { text: 'Değişiklikleri at', style: 'destructive', onPress: cancelEdit },
      ],
    );
  };

  const choosePattern = (pattern: ShiftPattern) => {
    setDraft((current) => ({
      ...current,
      pattern,
      preservedStartEntryIndex: undefined,
      customEntries: pattern === 'custom' && current.customEntries.length === 0
        ? [{ kind: 'SHIFT', templateIndex: 0 }, { kind: 'OFF' }]
        : current.customEntries,
    }));
  };

  const updateCustomEntry = (entryIndex: number, value: CustomEntryDraft) => {
    setDraft((current) => ({
      ...current,
      customEntries: current.customEntries.map((entry, index) => index === entryIndex ? value : entry),
    }));
  };

  const renderCyclePreview = (items: typeof preview) => (
    <View style={styles.previewWrap}>
      {items.map((item) => {
        const template = item.kind === 'SHIFT' ? draft.templates.find((candidate) => candidate.id === item.templateId) : undefined;
        const window = template ? getNominalShiftWindow(item.localDate, template.startLocalTime, template.endLocalTime) : null;
        return (
          <View key={item.localDate} style={[styles.previewDay, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.previewDate, { color: theme.muted }]}>{item.localDate.slice(5)}</Text>
            <ShiftKindBadge compact kind={item.kind} template={template} />
            {window ? <Text style={[styles.previewTime, { color: theme.muted }]}>{window.startLocalTime}–{window.endLocalTime}{window.crossesMidnight ? ' +1 gün' : ''}</Text> : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <PageHeading eyebrow="TERCİHLER" title="Ayarlar" subtitle="Vardiya düzenin cihazında saklanır. Kaydetmeden önce örneğini kontrol edebilirsin." />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Görünüm ve hızlı erişim</Text>
        <Action label={mode === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} onPress={() => void toggleMode()} theme={theme} secondary />
        <Action label="Ücret ve işyeri ayarları" onPress={() => router.push('/earnings-settings' as never)} theme={theme} secondary />
        <Action label="Net ödemeler" onPress={() => router.push('/net-payments' as never)} theme={theme} secondary />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Veri güvenliği</Text>
        <Text style={[styles.body, { color: theme.muted }]}>Şifreli yedeklerini dışa aktar, eski yedeğini geri yükle veya cihazındaki verileri kaldır.</Text>
        <Action label="Yedekleme ve veri silme" onPress={() => router.push('/backup' as never)} theme={theme} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>İlk kurulum</Text>
        <Text style={[styles.body, { color: theme.muted }]}>Vardiya, işyeri ve isteğe bağlı ücret adımlarını daha sonra yeniden gözden geçirebilirsin.</Text>
        <Action label="Kurulum adımlarını yeniden aç" onPress={() => {
          void saveOnboardingState(database, { step: 0, completed: false }).then(() => router.push('/onboarding' as never))
            .catch(() => Alert.alert('Kurulum açılamadı', 'Yerel ayarlar korunuyor. Biraz sonra yeniden deneyin.'));
        }} theme={theme} />
      </View>

      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.muted }}>Vardiya düzeni yükleniyor…</Text>
        </View>
      ) : error && !editing ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
          <Action label="Tekrar dene" onPress={() => void load()} theme={theme} />
        </View>
      ) : !editing && cycle ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{cycle.name}</Text>
              <Text style={[styles.body, { color: theme.muted }]}>{PATTERNS.find((item) => item.id === detectPattern(cycle))?.title} · {cycle.timezone}</Text>
              <Text style={[styles.body, { color: theme.muted }]}>Başlangıç {cycle.anchorLocalDate}</Text>
            </View>
            {startEntry?.kind === 'SHIFT' ? (
              <ShiftKindBadge kind="SHIFT" template={storedTemplates.find((item) => item.id === startEntry.templateId)} />
            ) : null}
          </View>
          <Action label="Düzeni düzenle" onPress={() => setEditing(true)} theme={theme} />
          {success ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{success}</Text> : null}
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Döngü bilgileri</Text>
            <Field label="Düzen adı" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} theme={theme} placeholder="Örn. Üretim vardiyam" />
            <Field label="Zaman dilimi (IANA)" value={draft.timezone} onChangeText={(timezone) => setDraft({ ...draft, timezone })} theme={theme} placeholder="Europe/Istanbul" />
            <DateTimePickerField mode="date" label="Döngü başlangıç tarihi" value={draft.anchorLocalDate} timezone={draft.timezone} onChange={(anchorLocalDate) => setDraft({ ...draft, anchorLocalDate })} onError={setError} />
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>Düzen türü</Text>
            <View style={styles.chipWrap}>
              {PATTERNS.map((item) => <Chip key={item.id} label={item.title} selected={draft.pattern === item.id} onPress={() => choosePattern(item.id)} theme={theme} accessibilityLabel={`${item.title}: ${item.hint}`} />)}
            </View>
            <Text style={[styles.hint, { color: theme.muted }]}>{PATTERNS.find((item) => item.id === draft.pattern)?.hint}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Vardiya şablonları</Text>
            {draft.templates.map((template, index) => (
              <View key={template.id} style={[styles.templateBox, { borderColor: theme.border }]}>
                <Text style={[styles.templateHeading, { color: theme.foreground }]}>Şablon {index + 1}</Text>
                <View style={styles.twoColumns}>
                  <View style={styles.flex}><Field label={`Şablon ${index + 1} adı`} value={template.name} onChangeText={(name) => updateTemplate(index, { name })} theme={theme} placeholder="Gündüz" /></View>
                  <View style={styles.codeField}><Field label={`Şablon ${index + 1} kodu`} value={template.code} onChangeText={(code) => updateTemplate(index, { code: code.toLocaleUpperCase('tr-TR') })} theme={theme} maxLength={5} placeholder="G" /></View>
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.flex}><DateTimePickerField mode="time" label={`Şablon ${index + 1} başlangıç saati`} value={template.startLocalTime} localDate={draft.anchorLocalDate} timezone={draft.timezone} onChange={(startLocalTime) => updateTemplate(index, { startLocalTime })} onError={setError} /></View>
                  <View style={styles.flex}><DateTimePickerField mode="time" label={`Şablon ${index + 1} bitiş saati`} value={template.endLocalTime} localDate={draft.anchorLocalDate} timezone={draft.timezone} onChange={(endLocalTime) => updateTemplate(index, { endLocalTime })} onError={setError} /></View>
                </View>
              </View>
            ))}
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>Başlangıç vardiyası</Text>
            <View style={styles.chipWrap}>
              {startTemplateOptions.map(({ template, index }) => (
                <Chip key={template.id} label={`${template.code || `V${index + 1}`} · ${template.name || `Vardiya ${index + 1}`}`} selected={draft.startTemplateIndex === index} onPress={() => setDraft({ ...draft, startTemplateIndex: index, preservedStartEntryIndex: undefined })} theme={theme} />
              ))}
            </View>
            {draft.pattern === 'custom' && startTemplateOptions.length === 0 ? (
              <Text style={[styles.hint, { color: theme.muted }]}>Başlangıç seçmek için özel döngüye en az bir vardiya günü ekle.</Text>
            ) : null}
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>Özel döngü günleri</Text>
            {draft.pattern === 'custom' ? (
              <View>
                {draft.customEntries.map((entry, index) => (
                  <View key={`custom-${index}`} style={[styles.customRow, { borderColor: theme.border }]}>
                    <Text style={[styles.customDay, { color: theme.muted }]}>{index + 1}. gün</Text>
                    <View style={styles.customControls}>
                      <Chip label="Vardiya" selected={entry.kind === 'SHIFT'} onPress={() => updateCustomEntry(index, { kind: 'SHIFT', templateIndex: entry.kind === 'SHIFT' ? entry.templateIndex : draft.startTemplateIndex })} theme={theme} />
                      <Chip label="OFF" selected={entry.kind === 'OFF'} onPress={() => updateCustomEntry(index, { kind: 'OFF' })} theme={theme} />
                      {entry.kind === 'SHIFT' ? draft.templates.map((template, templateIndex) => <Chip key={template.id} label={template.code || `V${templateIndex + 1}`} selected={entry.templateIndex === templateIndex} onPress={() => updateCustomEntry(index, { kind: 'SHIFT', templateIndex })} theme={theme} accessibilityLabel={`${index + 1}. gün ${template.name}`} />) : null}
                    </View>
                    <Pressable accessibilityLabel={`${index + 1}. özel günü kaldır`} accessibilityRole="button" hitSlop={8} onPress={() => setDraft({ ...draft, customEntries: draft.customEntries.filter((_, candidate) => candidate !== index) })} style={styles.removeEntry}>
                      <Text style={{ color: theme.muted, fontSize: 14 }}>Kaldır</Text>
                    </Pressable>
                  </View>
                ))}
                <Action label="Döngü gününe ekle" onPress={() => setDraft({ ...draft, customEntries: [...draft.customEntries, { kind: 'OFF' }] })} theme={theme} secondary={true} disabled={draft.customEntries.length >= 14} />
              </View>
            ) : (
              <Text style={[styles.hint, { color: theme.muted }]}>Seçilen hazır düzen günleri otomatik oluşturur. OFF, yalnız plan boş günüdür.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>14 günlük önizleme</Text>
            {preview.length ? renderCyclePreview(preview) : (
              <Text accessibilityRole="alert" style={{ color: theme.muted }}>Önizleme için vardiya bilgilerini ve başlangıç tarihini kontrol et.</Text>
            )}
          </View>

          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
          {success ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{success}</Text> : null}
          <View style={styles.actionRow}>
            <Action label={saving ? 'Kaydediliyor…' : 'Vardiya düzenini kaydet'} onPress={() => void save()} theme={theme} disabled={saving} />
            {cycle ? <Action label="Vazgeç" onPress={confirmCancelEdit} theme={theme} secondary={true} disabled={saving} /> : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 16 },
  eyebrow: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: -10, fontSize: 30, lineHeight: 38, fontWeight: '800' },
  intro: { marginTop: -8, fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  cardTitle: { fontSize: 21, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22 },
  field: { gap: 6 },
  fieldLabel: { marginTop: 2, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 19 },
  templateBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  templateHeading: { fontSize: 15, fontWeight: '700' },
  twoColumns: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  codeField: { width: 92 },
  customRow: { borderTopWidth: 1, paddingVertical: 10, gap: 8 },
  customDay: { fontSize: 13, fontWeight: '700' },
  customControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  removeEntry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  previewWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewDay: { minWidth: 125, flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 12, padding: 8, gap: 5 },
  previewDate: { fontSize: 12, fontWeight: '700' },
  previewTime: { fontSize: 12 },
  action: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  actionRow: { gap: 10 },
  statusRow: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  success: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
});
