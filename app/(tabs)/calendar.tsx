import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ShiftKindBadge } from '@/src/components/shifts/ShiftKindBadge';
import {
  getNominalShiftWindow,
  type PlanOverride,
  type PlannedShift,
  type ShiftCycle,
  type ShiftTemplate,
} from '@/src/domain/shift-cycle/index';
import {
  createPlanOverride,
  deletePlanOverride,
  getPlanOverride,
  getPlannedShiftsForRange,
  listShiftCycles,
  listShiftTemplates,
  updatePlanOverride,
} from '@/src/data/shiftCycleRepository';
import {
  daysInMonth,
  formatLocalDate,
  formatMonthTitle,
  getLocalToday,
  localDateForMonthDay,
  monthForLocalDate,
  monthRange,
  mondayFirstOffset,
  shiftYearMonth,
} from '@/src/features/shifts/dates';
import { colors } from '@/src/theme/tokens';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];
type OverrideKind = PlanOverride['kind'];

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

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
      <Text style={{ color: secondary ? theme.foreground : theme.surface, fontWeight: '800', fontSize: 15, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Choice({ label, selected, onPress, theme }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ left: 3, right: 3 }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, {
        backgroundColor: selected ? theme.accentSurface : theme.surface,
        borderColor: selected ? theme.accent : theme.border,
        opacity: pressed ? 0.72 : 1,
      }]}
    >
      <Text style={{ color: selected ? theme.accent : theme.foreground, fontSize: 14, fontWeight: selected ? '800' : '600' }}>{label}</Text>
    </Pressable>
  );
}

function Cell({
  date,
  item,
  template,
  selected,
  isToday,
  theme,
  onPress,
}: {
  date: string;
  item: PlannedShift;
  template?: ShiftTemplate;
  selected: boolean;
  isToday: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const dayNumber = Number(date.slice(-2));
  const shiftLabel = item.kind === 'SHIFT'
    ? `${template?.name ?? 'Vardiya'} ${template?.startLocalTime ?? ''} ${template?.endLocalTime ?? ''}`.trim()
    : item.kind === 'OFF' ? 'OFF, planlı boş gün' : 'İzin';
  return (
    <Pressable
      accessibilityLabel={`${formatLocalDate(date)}, ${shiftLabel}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ left: 3, right: 3 }}
      onPress={onPress}
      style={({ pressed }) => [styles.dayCell, {
        backgroundColor: selected ? theme.accentSurface : theme.surface,
        borderColor: selected ? theme.accent : isToday ? theme.muted : theme.border,
        opacity: pressed ? 0.72 : 1,
      }]}
    >
      <Text style={[styles.dayNumber, { color: theme.foreground }, isToday && { color: theme.accent, fontWeight: '900' }]}>{dayNumber}</Text>
      <ShiftKindBadge compact kind={item.kind} template={template} />
    </Pressable>
  );
}

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;
  const today = getLocalToday('Europe/Istanbul');
  const [month, setMonth] = useState(monthForLocalDate(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [days, setDays] = useState<PlannedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingOverride, setEditingOverride] = useState<PlanOverride | null>(null);
  const [overrideKind, setOverrideKind] = useState<OverrideKind>('SHIFT');
  const [overrideTemplateId, setOverrideTemplateId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, savedTemplates] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
      ]);
      setTemplates(savedTemplates);
      const active = cycles[0] ?? null;
      setCycle(active);
      if (!active) {
        setDays([]);
        return;
      }
      const range = monthRange(month);
      setDays(await getPlannedShiftsForRange(database, active.id, range.start, range.end));
    } catch {
      setError('Takvim bilgileri yüklenemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [database, month]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const daysByDate = useMemo(() => new Map(days.map((day) => [day.localDate, day])), [days]);
  const selectedPlan = daysByDate.get(selectedDate);
  const selectedTemplate = selectedPlan?.kind === 'SHIFT'
    ? templates.find((template) => template.id === selectedPlan.templateId)
    : undefined;
  const blankCells = useMemo(() => Array.from({ length: mondayFirstOffset(month) }, (_, index) => `blank-${index}`), [month]);
  const monthDays = useMemo(() => Array.from({ length: daysInMonth(month) }, (_, index) => index + 1), [month]);

  const openOverrideEditor = async () => {
    if (!cycle) return;
    setMessage(null);
    setError(null);
    try {
      const existing = await getPlanOverride(database, cycle.id, selectedDate);
      const plan = daysByDate.get(selectedDate);
      setEditingOverride(existing);
      setOverrideKind(existing?.kind ?? plan?.kind ?? 'SHIFT');
      setOverrideTemplateId(
        existing?.kind === 'SHIFT'
          ? existing.templateId
          : plan?.kind === 'SHIFT'
            ? plan.templateId ?? templates[0]?.id ?? ''
            : templates[0]?.id ?? '',
      );
      setOverrideReason(existing?.reason ?? '');
      setEditorVisible(true);
    } catch {
      setError('Seçilen günün planı yüklenemedi.');
    }
  };

  const saveOverride = async () => {
    if (!cycle) return;
    let override: PlanOverride;
    if (overrideKind === 'SHIFT') {
      if (!overrideTemplateId) {
        setError('Vardiya istisnası için bir şablon seçin.');
        return;
      }
      override = { localDate: selectedDate, kind: 'SHIFT', templateId: overrideTemplateId, ...(overrideReason.trim() ? { reason: overrideReason.trim() } : {}) };
    } else {
      override = { localDate: selectedDate, kind: overrideKind, ...(overrideReason.trim() ? { reason: overrideReason.trim() } : {}) };
    }

    setSaving(true);
    setError(null);
    try {
      if (editingOverride) {
        await updatePlanOverride(database, cycle.id, selectedDate, override);
      } else {
        await createPlanOverride(database, cycle.id, override);
      }
      setEditorVisible(false);
      setMessage(`${formatLocalDate(selectedDate)} planı kaydedildi.`);
      await load();
    } catch {
      setError('Bu günün istisnası kaydedilemedi. Seçilen şablonu ve günü kontrol edin.');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = () => {
    if (!cycle || !editingOverride) return;
    Alert.alert(
      'Gün istisnasını kaldır?',
      `${formatLocalDate(selectedDate)} yeniden çevrim düzenine göre gösterilecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İstisnayı kaldır',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            void deletePlanOverride(database, cycle.id, selectedDate)
              .then(async () => {
                setEditorVisible(false);
                setMessage('Gün istisnası kaldırıldı. Çevrim planı yeniden gösteriliyor.');
                await load();
              })
              .catch(() => setError('Gün istisnası kaldırılamadı.'))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  const switchMonth = (offset: number) => {
    const next = shiftYearMonth(month, offset);
    setMonth(next);
    setSelectedDate(localDateForMonthDay(next, 1));
    setMessage(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>PLANLANAN VARDİYALAR</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>Takvim</Text>

        <View style={styles.monthBar}>
          <Pressable accessibilityLabel="Önceki ay" accessibilityRole="button" hitSlop={8} onPress={() => switchMonth(-1)} style={[styles.monthArrow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text accessible={false} style={{ color: theme.foreground, fontSize: 20, fontWeight: '800' }}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.foreground }]}>{formatMonthTitle(month)}</Text>
          <Pressable accessibilityLabel="Sonraki ay" accessibilityRole="button" hitSlop={8} onPress={() => switchMonth(1)} style={[styles.monthArrow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text accessible={false} style={{ color: theme.foreground, fontSize: 20, fontWeight: '800' }}>›</Text>
          </Pressable>
        </View>

        {loading ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ color: theme.muted }}>Takvim yükleniyor…</Text>
          </View>
        ) : error && !cycle ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
            <Button label="Tekrar dene" onPress={() => void load()} theme={theme} />
          </View>
        ) : !cycle ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>Henüz vardiya düzeni yok</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Takvimini görmek için önce vardiya şablonlarını ve döngünü oluştur.</Text>
            <Button label="Vardiya düzeni oluştur" onPress={() => router.push('/(tabs)/settings')} theme={theme} />
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
            <Button label="Tekrar dene" onPress={() => void load()} theme={theme} />
          </View>
        ) : (
          <>
            <View style={[styles.calendarCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((label) => <Text key={label} accessibilityLabel={label} style={[styles.weekday, { color: theme.muted }]}>{label}</Text>)}
              </View>
              <View style={styles.grid}>
                {blankCells.map((key) => <View key={key} style={styles.blankCell} />)}
                {monthDays.map((dayNumber) => {
                  const date = localDateForMonthDay(month, dayNumber);
                  const item = daysByDate.get(date);
                  if (!item) return <View key={date} style={styles.blankCell} />;
                  const template = item.kind === 'SHIFT' ? templates.find((candidate) => candidate.id === item.templateId) : undefined;
                  return (
                    <Cell
                      key={date}
                      date={date}
                      item={item}
                      template={template}
                      selected={selectedDate === date}
                      isToday={today === date}
                      theme={theme}
                      onPress={() => { setSelectedDate(date); setMessage(null); setError(null); }}
                    />
                  );
                })}
              </View>
              <View style={styles.legend}>
                <ShiftKindBadge compact kind="SHIFT" template={templates[0]} />
                <ShiftKindBadge compact kind="OFF" />
                <ShiftKindBadge compact kind="LEAVE" />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.selectedDate, { color: theme.muted }]}>{formatLocalDate(selectedDate)}</Text>
              {selectedPlan ? (
                <>
                  <ShiftKindBadge kind={selectedPlan.kind} template={selectedTemplate} />
                  {selectedPlan.kind === 'SHIFT' && selectedTemplate ? (() => {
                    const window = getNominalShiftWindow(selectedDate, selectedTemplate.startLocalTime, selectedTemplate.endLocalTime);
                    return <Text style={[styles.shiftTime, { color: theme.foreground }]}>{window.startLocalTime}–{window.endLocalTime}{window.crossesMidnight ? ' · ertesi gün biter' : ''}</Text>;
                  })() : null}
                  {selectedPlan.source === 'OVERRIDE' ? <Text style={[styles.overrideHint, { color: theme.accent }]}>Tek günlük istisna · diğer döngü günleri değişmez</Text> : null}
                </>
              ) : null}
              <Button label={selectedPlan?.source === 'OVERRIDE' ? 'Gün istisnasını düzenle' : 'Bu günü değiştir'} onPress={() => void openOverrideEditor()} theme={theme} />
              {selectedPlan?.kind === 'SHIFT' && cycle ? (
                <Button
                  label="Planlı vardiyadan kayıt ekle"
                  onPress={() => router.push({ pathname: '/work-records', params: { action: 'planned', cycleId: cycle.id, localDate: selectedDate } })}
                  theme={theme}
                />
              ) : null}
              <Button label="Plansız çalışma kaydı ekle" onPress={() => router.push({ pathname: '/work-records', params: { action: 'manual', localDate: selectedDate } })} theme={theme} secondary />
              <Button label="Çalışma geçmişi" onPress={() => router.push('/work-records')} theme={theme} secondary />
            </View>
          </>
        )}
        {message ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{message}</Text> : null}
      </ScrollView>

      <Modal animationType="slide" onRequestClose={() => setEditorVisible(false)} transparent visible={editorVisible}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.background }]}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.foreground }]}>Gün planını değiştir</Text>
                  <Text style={[styles.body, { color: theme.muted }]}>{formatLocalDate(selectedDate)}</Text>
                </View>
                <Pressable accessibilityLabel="Pencereyi kapat" accessibilityRole="button" onPress={() => setEditorVisible(false)} style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.foreground, fontSize: 18 }}>×</Text>
                </Pressable>
              </View>
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>Plan türü</Text>
              <View style={styles.choices}>
                <Choice label="Vardiya" selected={overrideKind === 'SHIFT'} onPress={() => setOverrideKind('SHIFT')} theme={theme} />
                <Choice label="OFF" selected={overrideKind === 'OFF'} onPress={() => setOverrideKind('OFF')} theme={theme} />
                <Choice label="İzin" selected={overrideKind === 'LEAVE'} onPress={() => setOverrideKind('LEAVE')} theme={theme} />
              </View>
              {overrideKind === 'SHIFT' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.muted }]}>Vardiya şablonu</Text>
                  <View style={styles.choices}>
                    {templates.map((template) => <Choice key={template.id} label={`${template.code} · ${template.name}`} selected={overrideTemplateId === template.id} onPress={() => setOverrideTemplateId(template.id)} theme={theme} />)}
                  </View>
                </>
              ) : null}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: theme.muted }]}>İsteğe bağlı not</Text>
                <TextInput
                  accessibilityLabel="İsteğe bağlı not"
                  maxLength={120}
                  onChangeText={setOverrideReason}
                  placeholder="Bu gün için kısa bir not"
                  placeholderTextColor={theme.muted}
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]}
                  value={overrideReason}
                />
              </View>
              <Text style={[styles.overrideHint, { color: theme.muted }]}>Bu değişiklik yalnız seçili günü etkiler. OFF, yasal hafta tatili anlamına gelmez.</Text>
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: scheme === 'dark' ? '#FFB4A8' : '#A12B20' }]}>{error}</Text> : null}
              <Button label={saving ? 'Kaydediliyor…' : editingOverride ? 'Değişikliği kaydet' : 'Gün istisnasını kaydet'} onPress={() => void saveOverride()} theme={theme} disabled={saving} />
              {editingOverride ? <Button label="İstisnayı kaldır" onPress={removeOverride} theme={theme} secondary={true} disabled={saving} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 28, gap: 16 },
  eyebrow: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: -10, fontSize: 32, fontWeight: '800' },
  monthBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  monthArrow: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', textTransform: 'capitalize' },
  calendarCard: { borderWidth: 1, borderRadius: 18, padding: 10, gap: 8 },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  blankCell: { width: '13.8%', minHeight: 66, marginHorizontal: '0.2%' },
  dayCell: { width: '13.8%', minHeight: 66, marginHorizontal: '0.2%', padding: 4, borderWidth: 1, borderRadius: 9, gap: 5, alignItems: 'flex-start' },
  dayNumber: { fontSize: 13, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5, paddingTop: 6 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22 },
  selectedDate: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  shiftTime: { fontSize: 18, fontWeight: '800' },
  overrideHint: { fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 12 },
  success: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  error: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalContent: { padding: 20, paddingBottom: 32, gap: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: '800' },
  closeButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  flex: { flex: 1 },
});
