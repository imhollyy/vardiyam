import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';

import { ShiftKindBadge } from '@/src/components/shifts/ShiftKindBadge';
import {
  dayOrdinal,
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
  addLocalDays,
  localDateForMonthDay,
  monthForLocalDate,
  monthRange,
  mondayFirstOffset,
  shiftYearMonth,
} from '@/src/features/shifts/dates';
import { colors } from '@/src/theme/tokens';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { listWorkRecordsWithTimedBreaks, type WorkRecordWithTimedBreaks } from '@/src/data/workRecordRepository';
import { listWorkDayStatuses, type WorkDayStatusEntry } from '@/src/data/workSessionRepository';
import { formatDuration, getRecordRangeDifferenceMinutes } from '@/src/domain/work-record';
import { calendarMarker, hasUnsavedPlanDraft } from '@/src/features/shifts/presentation';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { ActionButton } from '@/src/components/ui/ActionButton';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];
type OverrideKind = PlanOverride['kind'];

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

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
  record,
  status,
  selected,
  isToday,
  theme,
  onPress,
}: {
  date: string;
  item?: PlannedShift;
  template?: ShiftTemplate;
  record?: WorkRecordWithTimedBreaks;
  status?: WorkDayStatusEntry;
  selected: boolean;
  isToday: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const dayNumber = Number(date.slice(-2));
  const shiftLabel = item?.kind === 'SHIFT'
    ? `${template?.name ?? 'Vardiya'} ${template?.startLocalTime ?? ''} ${template?.endLocalTime ?? ''}`.trim()
    : status?.status === 'LEAVE' ? 'İzin' : status?.status === 'SICK_REPORT' ? 'Rapor' : status?.status === 'NOT_WORKED' ? 'Gidilmedi' : item?.kind === 'OFF' ? 'OFF, planlı boş gün' : item?.kind === 'LEAVE' ? 'İzin' : 'Plan yok';
  const marker = calendarMarker({ planKind: item?.kind, startLocalTime: template?.startLocalTime, status: status?.status, completed: Boolean(record) });
  const semanticColor = theme[marker.tone];
  const difference = record ? getRecordRangeDifferenceMinutes(record.record) : null;
  return (
    <Pressable
      accessibilityLabel={`${formatLocalDate(date)}, ${record ? 'Çalışma tamamlandı, ' : ''}${shiftLabel}${difference === null || difference === 0 ? '' : `, mola dahil vardiya aralığı farkı ${difference > 0 ? 'artı ' : 'eksi '}${Math.abs(difference)} dakika`}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ left: 3, right: 3 }}
      onPress={onPress}
      style={({ pressed }) => [styles.dayCell, {
      backgroundColor: selected ? theme.accentSurface : record ? theme.successSurface : status?.status === 'NOT_WORKED' ? theme.dangerSurface : status?.status || item?.kind === 'LEAVE' ? theme.warningSurface : theme.surface,
        borderColor: selected ? theme.accent : isToday ? theme.muted : theme.border,
        opacity: pressed ? 0.72 : 1,
      }]}
    >
      <Text style={[styles.dayNumber, { color: theme.foreground }, isToday && { color: theme.accent, fontWeight: '900' }]}>{dayNumber}</Text>
      <Ionicons accessible={false} name={marker.icon} size={16} color={semanticColor} />
      {difference !== null && difference !== 0 ? <Text style={{ fontSize: 8, fontWeight: '900', color: difference > 0 ? theme.success : theme.danger }}>{difference > 0 ? '+' : '−'}{Math.round(Math.abs(difference) / 60 * 10) / 10}s</Text> : null}
    </Pressable>
  );
}

export default function CalendarScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const params = useLocalSearchParams<{ initialDate?: string | string[] }>();
  const initialDateParam = Array.isArray(params.initialDate) ? params.initialDate[0] : params.initialDate;
  const { theme } = useAppTheme();
  const today = getLocalToday('Europe/Istanbul');
  const [month, setMonth] = useState(monthForLocalDate(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [days, setDays] = useState<PlannedShift[]>([]);
  const [records, setRecords] = useState<WorkRecordWithTimedBreaks[]>([]);
  const [statuses, setStatuses] = useState<WorkDayStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingOverride, setEditingOverride] = useState<PlanOverride | null>(null);
  const [overrideKind, setOverrideKind] = useState<OverrideKind>('SHIFT');
  const [overrideTemplateId, setOverrideTemplateId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBaseline, setOverrideBaseline] = useState('');
  const overrideDraftSignature = JSON.stringify({ overrideKind, overrideTemplateId, overrideReason });
  const closeOverrideEditor = () => {
    if (hasUnsavedPlanDraft(overrideBaseline, overrideDraftSignature)) {
      Alert.alert('Değişiklikler kaydedilmedi', 'Gün planındaki taslak değişiklikler silinecek.', [
        { text: 'Düzenlemeye dön', style: 'cancel' },
        { text: 'Taslağı sil', style: 'destructive', onPress: () => setEditorVisible(false) },
      ]);
      return;
    }
    setEditorVisible(false);
  };

  useEffect(() => {
    if (!initialDateParam) return;
    const updateSelection = setTimeout(() => {
      try {
        dayOrdinal(initialDateParam);
        setSelectedDate(initialDateParam);
        setMonth(monthForLocalDate(initialDateParam));
      } catch {
        // Ignore malformed deep-link dates and keep the current calendar selection.
      }
    }, 0);
    return () => clearTimeout(updateSelection);
  }, [initialDateParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, savedTemplates, savedRecords] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
        listWorkRecordsWithTimedBreaks(database),
      ]);
      setTemplates(savedTemplates);
      setRecords(savedRecords);
      const active = cycles[0] ?? null;
      setCycle(active);
      const range = monthRange(month);
      const endExclusive = addLocalDays(range.end, 1);
      const savedStatuses = await listWorkDayStatuses(database, range.start, endExclusive);
      setStatuses(savedStatuses);
      if (!active) {
        setDays([]);
        return;
      }
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
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, WorkRecordWithTimedBreaks[]>();
    for (const item of records) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: item.record.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(item.record.startedAtUtc));
      const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
      const date = `${get('year')}-${get('month')}-${get('day')}`;
      if (date >= monthRange(month).start && date <= monthRange(month).end) grouped.set(date, [...(grouped.get(date) ?? []), item]);
    }
    return grouped;
  }, [records, month]);
  const statusesByDate = useMemo(() => new Map(statuses.map((item) => [item.localDate, item])), [statuses]);
  const selectedRecords = recordsByDate.get(selectedDate) ?? [];
  const selectedStatus = statusesByDate.get(selectedDate);

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
      setOverrideBaseline(JSON.stringify({
        overrideKind: existing?.kind ?? plan?.kind ?? 'SHIFT',
        overrideTemplateId: existing?.kind === 'SHIFT' ? existing.templateId : plan?.kind === 'SHIFT' ? plan.templateId ?? templates[0]?.id ?? '' : templates[0]?.id ?? '',
        overrideReason: existing?.reason ?? '',
      }));
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
      setOverrideBaseline(JSON.stringify({ overrideKind, overrideTemplateId, overrideReason }));
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
        <PageHeading eyebrow="PLANLANAN VARDİYALAR" title="Takvim" subtitle="Plan, fiilî çalışma ve gün durumları" />

        <View style={styles.monthBar}>
          <Pressable accessibilityLabel="Önceki ay" accessibilityRole="button" hitSlop={8} onPress={() => switchMonth(-1)} style={[styles.monthArrow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text accessible={false} style={{ color: theme.foreground, fontSize: 20, fontWeight: '800' }}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.foreground }]}>{formatMonthTitle(month)}</Text>
          <Pressable accessibilityLabel="Sonraki ay" accessibilityRole="button" hitSlop={8} onPress={() => switchMonth(1)} style={[styles.monthArrow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text accessible={false} style={{ color: theme.foreground, fontSize: 20, fontWeight: '800' }}>›</Text>
          </Pressable>
        </View>
        {month !== monthForLocalDate(today) ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Bugünün tarihine dön" onPress={() => { setMonth(monthForLocalDate(today)); setSelectedDate(today); setMessage(null); }} style={styles.todayLink}>
            <Ionicons accessible={false} name="today-outline" size={16} color={theme.accent} />
            <Text style={[styles.todayLinkText, { color: theme.accent }]}>Bugüne dön</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ color: theme.muted }}>Takvim yükleniyor…</Text>
          </View>
        ) : error && !cycle ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
            <ActionButton label="Tekrar dene" onPress={() => void load()} />
          </View>
        ) : !cycle && !records.length && !statuses.length ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>Henüz vardiya düzeni yok</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Takvimini görmek için önce vardiya şablonlarını ve döngünü oluştur.</Text>
            <ActionButton label="Vardiya düzeni oluştur" onPress={() => router.push('/(tabs)/settings')} />
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
            <ActionButton label="Tekrar dene" onPress={() => void load()} />
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
                  const record = recordsByDate.get(date)?.[0];
                  const status = statusesByDate.get(date);
                  if (!item && !record && !status) return <View key={date} style={styles.blankCell} />;
                  const template = item?.kind === 'SHIFT' ? templates.find((candidate) => candidate.id === item.templateId) : undefined;
                  return (
                    <Cell
                      key={date}
                      date={date}
                      item={item}
                      template={template}
                      record={record}
                      status={status}
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
              <View style={[styles.statusLegend, { borderTopColor: theme.border }]}>
                <LegendMark icon="checkmark-circle" label="Çalışıldı" color={theme.success} theme={theme} />
                <LegendMark icon="medkit-outline" label="Rapor" color={theme.warning} theme={theme} />
                <LegendMark icon="alert-circle-outline" label="Gidilmedi" color={theme.danger} theme={theme} />
                <Text style={[styles.deltaLegend, { color: theme.muted }]}>+ / − vardiya aralığı (mola dahil)</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.selectedHeader}>
                <View style={styles.flex}>
                  <Text style={[styles.selectedDate, { color: theme.muted }]}>{formatLocalDate(selectedDate)}</Text>
                  <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.foreground }]}>{selectedDate === today ? 'Bugün' : 'Seçili gün'}</Text>
                </View>
                {selectedPlan || selectedRecords.length || selectedStatus ? <Ionicons accessible={false} name={selectedRecords.length ? 'checkmark-circle' : selectedStatus?.status === 'NOT_WORKED' ? 'alert-circle-outline' : 'calendar-outline'} size={23} color={selectedRecords.length ? theme.success : selectedStatus?.status === 'NOT_WORKED' ? theme.danger : theme.accent} /> : null}
              </View>
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
              {selectedRecords.length ? <View style={[styles.actualRecords, { borderTopColor: theme.border }]}><Text style={[styles.fieldLabel, { color: theme.success }]}>Fiilî çalışma</Text>{selectedRecords.map((entry) => {
                const startAt = new Date(entry.record.startedAtUtc);
                const endAt = new Date(entry.record.endedAtUtc);
                const actualMinutes = Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 60_000) - entry.record.breakMinutes);
                const time = (value: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: entry.record.timezone, hour: '2-digit', minute: '2-digit' }).format(value);
                return <Pressable key={entry.record.id} accessibilityRole="button" accessibilityLabel={`Çalışma kaydını düzenle: ${time(startAt)} ile ${time(endAt)}, ${formatDuration(actualMinutes)} çalışıldı, ${entry.record.breakMinutes} dakika mola`} onPress={() => router.push({ pathname: '/work-records', params: { recordId: entry.record.id } })} style={[styles.actualRecord, { backgroundColor: theme.successSurface }]}><Ionicons accessible={false} name="checkmark-circle" size={19} color={theme.success} /><View style={styles.flex}><Text style={[styles.body, { color: theme.foreground }]}>{time(startAt)}–{time(endAt)}</Text><Text style={[styles.actualSummary, { color: theme.muted }]}>{formatDuration(actualMinutes)} çalışıldı · {entry.record.breakMinutes} dk mola</Text></View><Ionicons accessible={false} name="chevron-forward" size={17} color={theme.muted} /></Pressable>;
              })}</View> : null}
              {selectedStatus ? <View style={styles.dayStatus}><Ionicons accessible={false} name={selectedStatus.status === 'NOT_WORKED' ? 'alert-circle-outline' : selectedStatus.status === 'SICK_REPORT' ? 'medkit-outline' : 'sunny-outline'} size={17} color={selectedStatus.status === 'NOT_WORKED' ? theme.danger : theme.warning} /><Text style={[styles.overrideHint, { color: theme.foreground }]}>{selectedStatus.status === 'LEAVE' ? 'İzin' : selectedStatus.status === 'SICK_REPORT' ? 'Rapor' : 'Gidilmedi'}{selectedStatus.note ? ` · ${selectedStatus.note}` : ''}</Text></View> : null}
              {cycle ? <ActionButton label={selectedPlan?.source === 'OVERRIDE' ? 'Gün planını düzenle' : 'Gün planını değiştir'} onPress={() => void openOverrideEditor()} variant="secondary" /> : null}
              {selectedPlan?.kind === 'SHIFT' && cycle ? (
                <ActionButton
                  label="Planlı vardiyadan kayıt ekle"
                  onPress={() => router.push({ pathname: '/work-records', params: { action: 'planned', cycleId: cycle.id, localDate: selectedDate } })}
                />
              ) : null}
              <ActionButton label="Plansız çalışma kaydı ekle" onPress={() => router.push({ pathname: '/work-records', params: { action: 'manual', localDate: selectedDate } })} variant="secondary" />
              <ActionButton label="Tüm çalışma geçmişi" onPress={() => router.push('/work-records')} variant="quiet" />
            </View>
          </>
        )}
        {message ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{message}</Text> : null}
      </ScrollView>

      <Modal animationType="slide" onRequestClose={closeOverrideEditor} transparent visible={editorVisible}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.background }]}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.foreground }]}>Gün planını değiştir</Text>
                  <Text style={[styles.body, { color: theme.muted }]}>{formatLocalDate(selectedDate)}</Text>
                </View>
                <Pressable accessibilityLabel="Pencereyi kapat" accessibilityRole="button" onPress={closeOverrideEditor} style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <ActionButton label={saving ? 'Kaydediliyor…' : editingOverride ? 'Değişikliği kaydet' : 'Gün istisnasını kaydet'} onPress={() => void saveOverride()} disabled={saving} />
              {editingOverride ? <ActionButton label="İstisnayı kaldır" onPress={removeOverride} variant="secondary" disabled={saving} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LegendMark({ icon, label, color, theme }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; theme: Theme }) {
  return <View style={styles.legendMark}><Ionicons accessible={false} name={icon} size={13} color={color} /><Text style={[styles.legendMarkText, { color: theme.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 28, gap: 16 },
  eyebrow: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: -10, fontSize: 32, fontWeight: '800' },
  monthBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  monthArrow: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', textTransform: 'capitalize' },
  todayLink: { alignSelf: 'flex-end', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  todayLinkText: { fontSize: 13, fontWeight: '800' },
  calendarCard: { borderWidth: 1, borderRadius: 18, padding: 10, gap: 8 },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  blankCell: { width: '13.8%', minHeight: 66, marginHorizontal: '0.2%' },
  dayCell: { width: '13.8%', minHeight: 66, marginHorizontal: '0.2%', padding: 4, borderWidth: 1, borderRadius: 9, gap: 5, alignItems: 'flex-start' },
  dayNumber: { fontSize: 13, fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5, paddingTop: 6 },
  statusLegend: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  legendMark: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendMarkText: { fontSize: 10, fontWeight: '700' },
  deltaLegend: { fontSize: 10, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { fontSize: 15, lineHeight: 22 },
  selectedDate: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  shiftTime: { fontSize: 18, fontWeight: '800' },
  overrideHint: { fontSize: 13, lineHeight: 19 },
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
  actualRecords: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  actualRecord: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 12 },
  actualSummary: { fontSize: 12, lineHeight: 17 },
  dayStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
