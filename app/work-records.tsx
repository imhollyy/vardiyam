import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getShiftCycle, getPlannedShiftForDate, listShiftTemplates } from '@/src/data/shiftCycleRepository';
import {
  createWorkRecord,
  deleteWorkRecord,
  getWorkRecord,
  listWorkRecords,
  updateWorkRecord,
} from '@/src/data/workRecordRepository';
import {
  formatDuration,
  getLocalDateTimeCandidates,
  getRecordRangeDifferenceMinutes,
  localDateTimeToUtc,
  utcToLocalDateTime,
  validateWorkRecord,
  type PlannedWorkSnapshot,
  type WorkRecord,
  type WorkRecordSource,
} from '@/src/domain/work-record';
import { getNominalShiftWindow } from '@/src/domain/shift-cycle';
import { getLocalToday } from '@/src/features/shifts/dates';
import { colors } from '@/src/theme/tokens';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];
type FormDraft = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  breakMinutes: string;
  note: string;
  startOccurrence: 'earlier' | 'later' | null;
  endOccurrence: 'earlier' | 'later' | null;
};

function routeValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Button({ label, onPress, theme, secondary = false, disabled = false }: {
  label: string;
  onPress: () => void;
  theme: Theme;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, {
        backgroundColor: secondary ? theme.surface : theme.accent,
        borderColor: secondary ? theme.border : theme.accent,
        opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
      }]}
    >
      <Text style={{ color: secondary ? theme.foreground : theme.surface, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, theme, keyboardType = 'default', multiline = false, editable = true, hint }: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  theme: Theme;
  keyboardType?: 'default' | 'numbers-and-punctuation' | 'numeric';
  multiline?: boolean;
  editable?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={theme.muted}
        style={[styles.input, multiline && styles.multiline, !editable && { opacity: 0.7 }, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]}
        value={value}
      />
      {hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}
    </View>
  );
}

function localLabel(value: string, timezone: string): string {
  const [date, time] = value.split('T');
  return `${date} ${time} (${timezone})`;
}

function recordDateLabel(record: WorkRecord): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: record.timezone,
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(record.startedAtUtc));
}

function actualSpanMinutes(record: WorkRecord): number {
  return (Date.parse(record.endedAtUtc) - Date.parse(record.startedAtUtc)) / 60_000;
}

function recordError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Çalışma kaydı kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.';
}

function candidateCount(value: string, timezone: string): number {
  try { return getLocalDateTimeCandidates(value, timezone).length; }
  catch { return 0; }
}

function OccurrenceChoices({ label, value, timezone, selected, onSelect, theme }: {
  label: string;
  value: string;
  timezone: string;
  selected: 'earlier' | 'later' | null;
  onSelect: (value: 'earlier' | 'later') => void;
  theme: Theme;
}) {
  let candidates: string[];
  try { candidates = getLocalDateTimeCandidates(value, timezone); }
  catch { return null; }
  if (candidates.length < 2) return null;
  return (
    <View style={styles.occurrenceGroup}>
      <Text style={[styles.hint, { color: theme.muted }]}>{label}: bu yerel saat iki kez yaşanmış. Gerçek oluşumu seç.</Text>
      <View style={styles.choices}>
        {candidates.map((candidate, index) => {
          const choice = index === 0 ? 'earlier' : 'later';
          const utcTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(candidate));
          return (
            <Pressable
              key={candidate}
              accessibilityLabel={`${label}, ${index === 0 ? 'ilk' : 'ikinci'} oluşum, ${utcTime} UTC`}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === choice }}
              onPress={() => onSelect(choice)}
              style={({ pressed }) => [styles.occurrenceChoice, {
                backgroundColor: selected === choice ? theme.accentSurface : theme.surface,
                borderColor: selected === choice ? theme.accent : theme.border,
                opacity: pressed ? 0.72 : 1,
              }]}
            >
              <Text style={{ color: selected === choice ? theme.accent : theme.foreground, fontSize: 13, fontWeight: '700' }}>{index === 0 ? 'İlk' : 'İkinci'} oluşum · {utcTime} UTC</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function WorkRecordsScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string | string[]; cycleId?: string | string[]; localDate?: string | string[]; }>();
  const action = routeValue(params.action);
  const cycleIdParam = routeValue(params.cycleId);
  const localDateParam = routeValue(params.localDate);
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;
  const errorColor = scheme === 'dark' ? '#FFB4A8' : '#A12B20';

  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<'history' | 'form'>('history');
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const [source, setSource] = useState<WorkRecordSource>('MANUAL');
  const [planned, setPlanned] = useState<PlannedWorkSnapshot | null>(null);
  const [draft, setDraft] = useState<FormDraft>(() => {
    const today = localDateParam ?? getLocalToday('Europe/Istanbul');
    return { startDate: today, startTime: '08:00', endDate: today, endTime: '16:00', timezone: 'Europe/Istanbul', breakMinutes: '0', note: '', startOccurrence: null, endOccurrence: null };
  });
  const routeInitialized = useRef(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await listWorkRecords(database));
    } catch {
      setError('Çalışma geçmişi yüklenemedi. Veritabanını ve bağlantıyı kontrol edip yeniden deneyin.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  const openManualForm = useCallback((localDate = getLocalToday('Europe/Istanbul')) => {
    setRecord(null);
    setSource('MANUAL');
    setPlanned(null);
    setDraft({ startDate: localDate, startTime: '08:00', endDate: localDate, endTime: '16:00', timezone: 'Europe/Istanbul', breakMinutes: '0', note: '', startOccurrence: null, endOccurrence: null });
    setError(null);
    setMessage(null);
    setView('form');
  }, []);

  const openPlannedForm = useCallback(async (cycleId: string, localDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const [cycle, templates] = await Promise.all([
        getShiftCycle(database, cycleId),
        listShiftTemplates(database),
      ]);
      if (!cycle) throw new Error('Bağlı vardiya düzeni bulunamadı. Planı kontrol edip yeniden deneyin.');
      const projected = await getPlannedShiftForDate(database, cycle.id, localDate);
      if (projected.kind !== 'SHIFT' || !projected.templateId) {
        throw new Error('Seçilen günde planlı vardiya yok. Plansız çalışma kaydı ekleyebilirsiniz.');
      }
      const template = templates.find((item) => item.id === projected.templateId);
      if (!template) throw new Error('Planlı vardiya şablonu bulunamadı.');
      const window = getNominalShiftWindow(localDate, template.startLocalTime, template.endLocalTime);
      const startLocalDateTime = `${window.startDate}T${window.startLocalTime}`;
      const endLocalDateTime = `${window.endDate}T${window.endLocalTime}`;
      setRecord(null);
      setSource('PLANNED');
      setPlanned({ cycleId: cycle.id, localDate, templateId: template.id, templateName: template.name, startLocalDateTime, endLocalDateTime });
      setDraft({
        startDate: window.startDate,
        startTime: window.startLocalTime,
        endDate: window.endDate,
        endTime: window.endLocalTime,
        timezone: cycle.timezone,
        breakMinutes: '0',
        note: '',
        startOccurrence: null,
        endOccurrence: null,
      });
      setView('form');
      setMessage(null);
    } catch (cause) {
      setError(recordError(cause));
      setView('history');
    } finally {
      setLoading(false);
    }
  }, [database]);

  const openEditForm = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const existing = await getWorkRecord(database, id);
      if (!existing) throw new Error('Çalışma kaydı bulunamadı. Geçmişi yenileyin.');
      const start = utcToLocalDateTime(existing.startedAtUtc, existing.timezone);
      const end = utcToLocalDateTime(existing.endedAtUtc, existing.timezone);
      const [startDate, startTime] = start.split('T');
      const [endDate, endTime] = end.split('T');
      const startCandidates = getLocalDateTimeCandidates(start, existing.timezone);
      const endCandidates = getLocalDateTimeCandidates(end, existing.timezone);
      setRecord(existing);
      setSource(existing.source);
      setPlanned(existing.planned);
      setDraft({
        startDate, startTime, endDate, endTime, timezone: existing.timezone,
        breakMinutes: String(existing.breakMinutes), note: existing.note ?? '',
        startOccurrence: startCandidates.length > 1 ? (startCandidates[0] === existing.startedAtUtc ? 'earlier' : 'later') : null,
        endOccurrence: endCandidates.length > 1 ? (endCandidates[0] === existing.endedAtUtc ? 'earlier' : 'later') : null,
      });
      setView('form');
      setMessage(null);
    } catch (cause) {
      setError(recordError(cause));
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(useCallback(() => {
    void loadHistory();
    if (routeInitialized.current) return;
    routeInitialized.current = true;
    if (action === 'manual') openManualForm(localDateParam);
    else if (action === 'planned' && cycleIdParam && localDateParam) void openPlannedForm(cycleIdParam, localDateParam);
  }, [action, cycleIdParam, loadHistory, localDateParam, openManualForm, openPlannedForm, routeInitialized]));

  const elapsedMinutes = useMemo(() => {
    try {
      const start = localDateTimeToUtc(`${draft.startDate}T${draft.startTime}`, draft.timezone, draft.startOccurrence ?? undefined);
      const end = localDateTimeToUtc(`${draft.endDate}T${draft.endTime}`, draft.timezone, draft.endOccurrence ?? undefined);
      return (Date.parse(end) - Date.parse(start)) / 60_000;
    } catch { return null; }
  }, [draft]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const breakMinutes = draft.breakMinutes.trim() === '' ? Number.NaN : Number(draft.breakMinutes);
      const next: WorkRecord = {
        id: record?.id ?? `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source,
        startedAtUtc: localDateTimeToUtc(`${draft.startDate}T${draft.startTime}`, draft.timezone, draft.startOccurrence ?? undefined),
        endedAtUtc: localDateTimeToUtc(`${draft.endDate}T${draft.endTime}`, draft.timezone, draft.endOccurrence ?? undefined),
        timezone: draft.timezone.trim(),
        breakMinutes,
        note: draft.note.trim() || null,
        planned,
      };
      validateWorkRecord(next);
      if (record) await updateWorkRecord(database, next);
      else await createWorkRecord(database, next);
      setMessage(record ? 'Çalışma kaydı güncellendi.' : 'Çalışma kaydı kaydedildi.');
      setView('history');
      await loadHistory();
    } catch (cause) {
      setError(recordError(cause));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item: WorkRecord) => {
    Alert.alert(
      'Çalışma kaydı silinsin mi?',
      `${recordDateLabel(item)} kaydı kalıcı olarak silinecek. Planlanan vardiya değişmeyecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaydı sil', style: 'destructive', onPress: () => {
            setDeleting(true);
            setError(null);
            void deleteWorkRecord(database, item.id)
              .then(async () => { setMessage('Çalışma kaydı silindi.'); await loadHistory(); })
              .catch(() => setError('Çalışma kaydı silinemedi. Tekrar deneyin.'))
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  };

  const cancelForm = () => {
    Alert.alert('Düzenlemeyi bırak?', 'Kaydedilmemiş değişiklikler kaybolacak.', [
      { text: 'Düzenlemeye dön', style: 'cancel' },
      { text: 'Değişiklikleri at', style: 'destructive', onPress: () => { setView('history'); setError(null); } },
    ]);
  };

  const renderRecord = ({ item }: { item: WorkRecord }) => {
    const start = utcToLocalDateTime(item.startedAtUtc, item.timezone);
    const end = utcToLocalDateTime(item.endedAtUtc, item.timezone);
    const difference = getRecordRangeDifferenceMinutes(item);
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={[styles.dateTitle, { color: theme.foreground }]}>{recordDateLabel(item)}</Text>
            <Text style={[styles.kind, { color: theme.accent }]}>{item.source === 'PLANNED' ? 'PLANLI KAYIT' : 'PLANSIZ KAYIT'}</Text>
          </View>
          <Text style={[styles.duration, { color: theme.foreground }]}>{formatDuration(actualSpanMinutes(item))}</Text>
        </View>
        <Text style={[styles.body, { color: theme.foreground }]}>{localLabel(start, item.timezone)} → {localLabel(end, item.timezone)}</Text>
        <Text style={[styles.detail, { color: theme.muted }]}>Mola: {formatDuration(item.breakMinutes)} · Zaman dilimi: {item.timezone}</Text>
        {item.planned ? (
          <View style={[styles.planSnapshot, { borderColor: theme.border }]}>
            <Text style={[styles.detailStrong, { color: theme.foreground }]}>Plan anlık görüntüsü · {item.planned.templateName}</Text>
            <Text style={[styles.detail, { color: theme.muted }]}>{localLabel(item.planned.startLocalDateTime, item.timezone)} → {localLabel(item.planned.endLocalDateTime, item.timezone)}</Text>
            {difference === null ? null : <Text style={[styles.detailStrong, { color: theme.accent }]}>Saat aralığı farkı: {formatDuration(difference)}</Text>}
            <Text style={[styles.hint, { color: theme.muted }]}>Yalnız süre farkıdır; ücret veya yasal mesai hesabı değildir.</Text>
          </View>
        ) : null}
        {item.note ? <Text style={[styles.body, { color: theme.muted }]}>{item.note}</Text> : null}
        <View style={styles.actions}>
          <Button label="Düzenle" onPress={() => void openEditForm(item.id)} theme={theme} secondary />
          <Button label={deleting ? 'Siliniyor…' : 'Sil'} onPress={() => confirmDelete(item)} theme={theme} secondary disabled={deleting} />
        </View>
      </View>
    );
  };

  const header = (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Önceki ekrana dön" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.backButton}>
        <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '800' }}>‹ Geri</Text>
      </Pressable>
      <Text style={[styles.eyebrow, { color: theme.accent }]}>FİİLÎ ÇALIŞMA</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{view === 'form' ? (record ? 'Kaydı düzenle' : 'Çalışma ekle') : 'Çalışma geçmişi'}</Text>
      <Text style={[styles.intro, { color: theme.muted }]}>Planlanan vardiya ile gerçekleşen çalışma ayrı kayıtlardır. Bu ekranda ücret veya yasal mesai hesabı yapılmaz.</Text>
    </View>
  );

  if (loading && records.length === 0 && view === 'history') {
    return <View style={[styles.loading, { backgroundColor: theme.background }]}>{header}<ActivityIndicator color={theme.accent} /><Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>Çalışma geçmişi yükleniyor…</Text></View>;
  }

  if (view === 'form') {
    return (
      <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
        {header}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {planned ? (
            <View style={[styles.planSnapshot, { borderColor: theme.border }]}>
              <Text style={[styles.detailStrong, { color: theme.foreground }]}>Planlanan: {planned.templateName}</Text>
              <Text style={[styles.detail, { color: theme.muted }]}>{localLabel(planned.startLocalDateTime, draft.timezone)} → {localLabel(planned.endLocalDateTime, draft.timezone)}</Text>
              <Text style={[styles.hint, { color: theme.muted }]}>Bu plan anlık görüntüsü kayıtla birlikte saklanır; plan değişikliği fiilî kaydı değiştirmez.</Text>
            </View>
          ) : null}
          <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Gerçekleşen zaman aralığı</Text>
          <View style={styles.twoColumns}>
            <View style={styles.flex}><Field label="Başlangıç tarihi (YYYY-MM-DD)" value={draft.startDate} onChangeText={(startDate) => setDraft({ ...draft, startDate, startOccurrence: null })} theme={theme} keyboardType="numbers-and-punctuation" /></View>
            <View style={styles.flex}><Field label="Başlangıç saati (HH:mm)" value={draft.startTime} onChangeText={(startTime) => setDraft({ ...draft, startTime, startOccurrence: null })} theme={theme} keyboardType="numbers-and-punctuation" /></View>
          </View>
          <OccurrenceChoices label="Başlangıç saati" value={`${draft.startDate}T${draft.startTime}`} timezone={draft.timezone} selected={draft.startOccurrence} onSelect={(startOccurrence) => setDraft({ ...draft, startOccurrence })} theme={theme} />
          <View style={styles.twoColumns}>
            <View style={styles.flex}><Field label="Bitiş tarihi (YYYY-MM-DD)" value={draft.endDate} onChangeText={(endDate) => setDraft({ ...draft, endDate, endOccurrence: null })} theme={theme} keyboardType="numbers-and-punctuation" /></View>
            <View style={styles.flex}><Field label="Bitiş saati (HH:mm)" value={draft.endTime} onChangeText={(endTime) => setDraft({ ...draft, endTime, endOccurrence: null })} theme={theme} keyboardType="numbers-and-punctuation" /></View>
          </View>
          <OccurrenceChoices label="Bitiş saati" value={`${draft.endDate}T${draft.endTime}`} timezone={draft.timezone} selected={draft.endOccurrence} onSelect={(endOccurrence) => setDraft({ ...draft, endOccurrence })} theme={theme} />
          <Field label="Zaman dilimi (IANA)" value={draft.timezone} onChangeText={(timezone) => setDraft({ ...draft, timezone, startOccurrence: null, endOccurrence: null })} theme={theme} editable={!record && source === 'MANUAL' && !planned} hint="Gece yarısını aşan kayıt için bitiş tarihini ertesi gün seç. Tekrarlanan saatlerde oluşumu seç." />
          <Field label="Mola süresi (tam dakika)" value={draft.breakMinutes} onChangeText={(breakMinutes) => setDraft({ ...draft, breakMinutes })} theme={theme} keyboardType="numeric" hint="0 veya çalışma aralığından kısa bir tam sayı gir." />
          <Field label="Not (isteğe bağlı)" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} theme={theme} multiline />
          <Text style={[styles.detail, { color: theme.muted }]}>{elapsedMinutes === null ? 'Zaman aralığını kontrol et.' : elapsedMinutes > 0 ? `Toplam aralık: ${formatDuration(elapsedMinutes)} · Mola sonrası: ${formatDuration(elapsedMinutes - Number(draft.breakMinutes || 0))}` : 'Bitiş, başlangıçtan sonra olmalıdır.'}</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: errorColor }]}>{error}</Text> : null}
          <Button
            label={saving ? 'Kaydediliyor…' : record ? 'Değişiklikleri kaydet' : 'Çalışma kaydını kaydet'}
            onPress={() => void save()}
            theme={theme}
            disabled={saving || (candidateCount(`${draft.startDate}T${draft.startTime}`, draft.timezone) > 1 && !draft.startOccurrence) || (candidateCount(`${draft.endDate}T${draft.endTime}`, draft.timezone) > 1 && !draft.endOccurrence)}
          />
          <Button label="Vazgeç" onPress={cancelForm} theme={theme} secondary disabled={saving} />
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      contentContainerStyle={[styles.screen, { backgroundColor: theme.background }, records.length === 0 && styles.emptyScreen]}
      data={records}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={(
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Henüz çalışma kaydı yok</Text>
          <Text style={[styles.body, { color: theme.muted }]}>İster vardiya planından başlat, ister plansız çalışmanı kendin ekle.</Text>
          <Button label="Plansız çalışma ekle" onPress={() => openManualForm()} theme={theme} />
        </View>
      )}
      ListHeaderComponent={(
        <>
          {header}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: errorColor }]}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{message}</Text> : null}
          <Button label="Plansız çalışma ekle" onPress={() => openManualForm()} theme={theme} />
        </>
      )}
      renderItem={renderRecord}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 34, gap: 14 },
  emptyScreen: { flexGrow: 1 },
  header: { gap: 10 },
  backButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '800' },
  intro: { fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12, marginBottom: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  dateTitle: { fontSize: 17, fontWeight: '800', textTransform: 'capitalize' },
  kind: { marginTop: 4, fontSize: 11, fontWeight: '800', letterSpacing: 0.9 },
  duration: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 21 },
  detail: { fontSize: 13, lineHeight: 20 },
  detailStrong: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 18 },
  field: { gap: 6, flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  planSnapshot: { borderLeftWidth: 3, paddingLeft: 12, gap: 6 },
  occurrenceGroup: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  occurrenceChoice: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { minHeight: 48, flexGrow: 1, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  success: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
