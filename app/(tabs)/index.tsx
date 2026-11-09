import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getActiveWorkSession, listWorkDayStatuses, startActiveWorkSession, type WorkDayStatus, type WorkDayStatusEntry } from '@/src/data/workSessionRepository';
import { getPlannedShiftForDate, getPlannedShiftsForRange, listShiftCycles, listShiftTemplates } from '@/src/data/shiftCycleRepository';
import { listDayEditNotes } from '@/src/data/dayEditRepository';
import { completeActiveWorkSessionWithRecord, listWorkRecordsWithTimedBreaks, type WorkRecordWithTimedBreaks } from '@/src/data/workRecordRepository';
import { getLocalDateTimeCandidates, getRecordRangeDifferenceMinutes, localDateTimeToUtc, utcToLocalDateTime, type PlannedWorkSnapshot, type WorkRecord } from '@/src/domain/work-record';
import { dayOrdinal, getNominalShiftWindow, type PlannedShift, type ShiftCycle, type ShiftTemplate } from '@/src/domain/shift-cycle';
import { addLocalDays, daysInMonth, formatLocalDate, formatMonthTitle, getLocalToday, localDateForMonthDay, monthForLocalDate, monthRange, mondayFirstOffset, mondayFirstWeekdayOffset, shiftYearMonth } from '@/src/features/shifts/dates';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { colors } from '@/src/theme/tokens';
import { calendarMarker, canStartClockIn } from '@/src/features/shifts/presentation';
import { ActionButton as SharedActionButton } from '@/src/components/ui/ActionButton';
import { DayEditSheet } from '@/src/components/shifts/DayEditSheet';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];
const ZONE = 'Europe/Istanbul';
const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const STATUS_LABELS: Record<WorkDayStatus, string> = { LEAVE: 'İzin', SICK_REPORT: 'Rapor', NOT_WORKED: 'Gidilmedi' };

function localClock(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function currentDateTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function shortDate(date: string): string {
  return formatLocalDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

function dateForTime(value: string): Date {
  const [hour = '0', minute = '0'] = value.split(':');
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date;
}

function timeFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function localRecordDate(item: WorkRecordWithTimedBreaks): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: item.record.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(item.record.startedAtUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftMinutes(template: ShiftTemplate): number {
  const [startHour, startMinute] = template.startLocalTime.split(':').map(Number);
  const [endHour, endMinute] = template.endLocalTime.split(':').map(Number);
  let minutes = endHour * 60 + endMinute - startHour * 60 - startMinute;
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} sa ${remainder} dk` : `${hours} sa`;
}

function durationShort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}sa${remainder ? ` ${remainder}dk` : ''}` : `${remainder}dk`;
}

function MiniCell({ date, plan, template, status, record, selected, onPress, theme }: {
  date: string; plan?: PlannedShift; template?: ShiftTemplate; status?: WorkDayStatus; record?: WorkRecordWithTimedBreaks;
  selected: boolean; onPress: () => void; theme: Theme;
}) {
  const difference = record ? getRecordRangeDifferenceMinutes(record.record) : null;
  const markerPresentation = calendarMarker({ planKind: plan?.kind, startLocalTime: plan?.startLocalTime ?? template?.startLocalTime, status, completed: Boolean(record) });
  const markerColor = theme[markerPresentation.tone];
  const spokenStatus = record ? 'Çalışma tamamlandı' : status ? STATUS_LABELS[status] : plan?.kind === 'OFF' ? 'OFF' : plan?.kind === 'LEAVE' ? 'İzin planı' : plan?.kind === 'SHIFT' ? `${template?.name ?? 'Vardiya'} ${plan.startLocalTime ?? template?.startLocalTime ?? ''} ${plan.endLocalTime ?? template?.endLocalTime ?? ''}` : 'Plan yok';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${formatLocalDate(date)}, ${spokenStatus}${difference === null ? '' : `, süre farkı ${difference > 0 ? '+' : difference < 0 ? 'eksi ' : ''}${durationLabel(Math.abs(difference))}`}`}
      accessibilityState={{ selected }} hitSlop={{ top: 2, bottom: 2, left: 3, right: 3 }} onPress={onPress} style={({ pressed }) => [styles.dayCell, {
      backgroundColor: record ? theme.successSurface : status === 'NOT_WORKED' ? theme.dangerSurface : status || plan?.kind === 'LEAVE' ? theme.warningSurface : theme.surface,
        borderColor: selected ? theme.accent : theme.border, opacity: pressed ? 0.75 : 1,
      }]}>
      <Text style={[styles.dayNumber, { color: theme.foreground }]}>{Number(date.slice(-2))}</Text>
      {markerPresentation.icon !== 'remove-outline' ? <Ionicons accessible={false} name={markerPresentation.icon} size={15} color={markerColor} /> : <View style={styles.markerSpacer} />}
      {difference !== null && difference !== 0 ? <Text accessible={false} style={[styles.delta, { color: difference > 0 ? theme.success : theme.danger }]}>{difference > 0 ? '+' : '−'}{durationShort(Math.abs(difference))}</Text> : null}
    </Pressable>
  );
}

export default function TodayScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { openDate } = useLocalSearchParams<{ openDate?: string }>();
  const { theme, mode, toggleMode } = useAppTheme();
  const [now, setNow] = useState(() => new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plans, setPlans] = useState<PlannedShift[]>([]);
  const [records, setRecords] = useState<WorkRecordWithTimedBreaks[]>([]);
  const [statuses, setStatuses] = useState<Map<string, WorkDayStatusEntry>>(new Map());
  const [dayNotes, setDayNotes] = useState<Map<string, string>>(new Map());
  const [active, setActive] = useState<Awaited<ReturnType<typeof getActiveWorkSession>>>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => localClock(new Date(), ZONE));
  const [endTime, setEndTime] = useState(() => localClock(new Date(), ZONE));
  const [startTimeEdited, setStartTimeEdited] = useState(false);
  const [endTimeEdited, setEndTimeEdited] = useState(false);
  const [endOccurrence, setEndOccurrence] = useState<'earlier' | 'later' | undefined>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [menu, setMenu] = useState<'profile' | 'notifications' | null>(null);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [draftTime, setDraftTime] = useState(() => dateForTime(localClock(new Date(), ZONE)));
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const viewTimezone = active?.timezone ?? cycle?.timezone ?? ZONE;
  const today = getLocalToday(viewTimezone, now);
  const month = shiftYearMonth(monthForLocalDate(today), monthOffset);
  const weekStart = addLocalDays(today, -mondayFirstWeekdayOffset(today));
  const weekEnd = addLocalDays(weekStart, 7);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const [cycles, savedTemplates, savedRecords, currentSession] = await Promise.all([
          listShiftCycles(database), listShiftTemplates(database), listWorkRecordsWithTimedBreaks(database), getActiveWorkSession(database),
        ]);
        if (cancelled) return;
        const selectedCycle = cycles[0] ?? null;
        const focusTimezone = currentSession?.timezone ?? selectedCycle?.timezone ?? ZONE;
        const focusedToday = getLocalToday(focusTimezone);
        const focusedWeekStart = addLocalDays(focusedToday, -mondayFirstWeekdayOffset(focusedToday));
        const focusedWeekEnd = addLocalDays(focusedWeekStart, 7);
        const currentMonth = shiftYearMonth(monthForLocalDate(focusedToday), monthOffset);
        const focusedMonthRange = monthRange(currentMonth);
        const visibleStart = focusedWeekStart < focusedMonthRange.start ? focusedWeekStart : focusedMonthRange.start;
        const visibleEnd = focusedWeekEnd > focusedMonthRange.end ? focusedWeekEnd : focusedMonthRange.end;
        const [savedStatuses, projectedPlans, savedDayNotes] = await Promise.all([
          listWorkDayStatuses(database, visibleStart, visibleEnd),
          selectedCycle ? getPlannedShiftsForRange(database, selectedCycle.id, visibleStart, visibleEnd) : Promise.resolve([]),
          listDayEditNotes(database, visibleStart, visibleEnd),
        ]);
        if (cancelled) return;
        setCycle(selectedCycle); setTemplates(savedTemplates); setRecords(savedRecords); setActive(currentSession);
        if (currentSession) {
          setStartTime(utcToLocalDateTime(currentSession.startedAtUtc, currentSession.timezone).slice(11));
          setEndTime(localClock(new Date(), currentSession.timezone));
          setEndTimeEdited(false);
        }
        setStatuses(new Map(savedStatuses.map((item) => [item.localDate, item])));
        setDayNotes(new Map(savedDayNotes.map((item) => [item.localDate, item.note])));
        setPlans(projectedPlans);
      } catch {
        if (!cancelled) setError('Ana ekran verileri yüklenemedi. Yerel verilerin korunuyor; tekrar deneyebilirsin.');
      } finally { if (!cancelled) setLoading(false); }
    };
    refreshRef.current = load;
    void load();
    return () => { cancelled = true; if (refreshRef.current === load) refreshRef.current = null; };
  }, [database, monthOffset]));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const visibleStartTime = !active && !startTimeEdited ? localClock(now, cycle?.timezone ?? ZONE) : startTime;
  const visibleEndTime = active && !endTimeEdited ? localClock(now, active.timezone) : endTime;

  const plansByDate = useMemo(() => new Map(plans.map((item) => [item.localDate, item])), [plans]);
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, WorkRecordWithTimedBreaks[]>();
    for (const item of records) {
      const date = localRecordDate(item);
      grouped.set(date, [...(grouped.get(date) ?? []), item]);
    }
    return grouped;
  }, [records]);
  const templatesById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);
  const monthDays = Array.from({ length: daysInMonth(month) }, (_, index) => index + 1);
  const weeklyPlans = Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(weekStart, index);
    const plan = plansByDate.get(date);
    const template = plan?.kind === 'SHIFT' ? templatesById.get(plan.templateId ?? '') : undefined;
    return { date, plan, template };
  });
  const scheduledDays = weeklyPlans.filter(({ plan }) => plan?.kind === 'SHIFT').length;
  const scheduledMinutes = weeklyPlans.reduce((sum, item) => sum + (item.template ? shiftMinutes(item.template) : 0), 0);
  const selectedPlan = selectedDate ? plansByDate.get(selectedDate) : undefined;
  const selectedRecords = selectedDate ? recordsByDate.get(selectedDate) ?? [] : [];
  const cellCount = mondayFirstOffset(month);
  const todayPlan = plansByDate.get(today);
  const todayTemplate = todayPlan?.kind === 'SHIFT' ? templatesById.get(todayPlan.templateId ?? '') : undefined;
  const todayRecordAlreadyCompleted = records.some((item) => utcToLocalDateTime(item.record.startedAtUtc, cycle?.timezone ?? ZONE).slice(0, 10) === today);
  const activeStartLocal = active ? utcToLocalDateTime(active.startedAtUtc, active.timezone) : null;
  const endCandidates = active ? (() => {
    const current = currentDateTime(now, active.timezone);
    let candidateDate = current.slice(0, 10);
    const startTimeLocal = activeStartLocal?.slice(11) ?? '00:00';
    if (candidateDate === active.startedLocalDate && visibleEndTime <= startTimeLocal) candidateDate = addLocalDays(candidateDate, 1);
    const local = `${candidateDate}T${visibleEndTime}`;
    try { return { local, candidates: getLocalDateTimeCandidates(local, active.timezone) }; }
    catch { return { local, candidates: [] as string[] }; }
  })() : null;

  const startShift = async () => {
    if (todayRecordAlreadyCompleted) {
      setNotice('Bugün için tamamlanmış çalışma kaydı var. Yeni kayıt gerekiyorsa çalışma geçmişinden elle ekleyebilirsin.');
      return;
    }
    setError(null); setNotice(null); setSaving(true);
    try {
      const timezone = cycle?.timezone ?? ZONE;
      const localDateTime = `${today}T${visibleStartTime}`;
      const startedAtUtc = localDateTimeToUtc(localDateTime, timezone);
      let planned: PlannedWorkSnapshot | null = null;
      if (todayPlan?.kind === 'SHIFT' && todayTemplate && cycle) {
        const window = getNominalShiftWindow(today, todayPlan.startLocalTime ?? todayTemplate.startLocalTime, todayPlan.endLocalTime ?? todayTemplate.endLocalTime);
        planned = {
          cycleId: cycle.id, localDate: today, templateId: todayTemplate.id, templateName: todayTemplate.name,
          startLocalDateTime: `${window.startDate}T${window.startLocalTime}`,
          endLocalDateTime: `${window.endDate}T${window.endLocalTime}`,
        };
      }
      const localStartDate = currentDateTime(new Date(Date.parse(startedAtUtc)), timezone).slice(0, 10);
      await startActiveWorkSession(database, { startedAtUtc, startedLocalDate: localStartDate, timezone, planned });
      setNotice('Mesai başladı. Bitirme saati kaydedilince çalışma geçmişine eklenecek.');
      await refreshRef.current?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mesai başlatılamadı. Kayıtların değiştirilmedi.');
    } finally { setSaving(false); }
  };

  const finishShift = async () => {
    if (!active || !endCandidates) return;
    setError(null); setNotice(null); setSaving(true);
    try {
      if (!endCandidates.candidates.length) throw new Error('Bitiş saati bu zaman diliminde geçerli değil. Saati kontrol et.');
      if (endCandidates.candidates.length > 1 && !endOccurrence) throw new Error('Bu saat iki kez yaşanmış. İlk veya ikinci oluşumu seç.');
      const occurrence = endCandidates.candidates.length > 1 ? endOccurrence : undefined;
      const endedAtUtc = localDateTimeToUtc(endCandidates.local, active.timezone, occurrence);
      if (Date.parse(endedAtUtc) <= Date.parse(active.startedAtUtc)) throw new Error('Bitiş zamanı başlangıçtan sonra olmalı.');
      const workRecord: WorkRecord = {
        id: `clock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: active.planned ? 'PLANNED' : 'MANUAL', startedAtUtc: active.startedAtUtc, endedAtUtc,
        timezone: active.timezone, breakMinutes: 0, note: null, planned: active.planned,
      };
      await completeActiveWorkSessionWithRecord(database, workRecord);
      setStartTime(localClock(new Date(), active.timezone)); setStartTimeEdited(false); setEndTimeEdited(false);
      setEndOccurrence(undefined); setNotice('Mesai tamamlandı ve çalışma geçmişine kaydedildi.');
      await refreshRef.current?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mesai tamamlanamadı. Açık başlangıç kaydı korundu.');
    } finally { setSaving(false); }
  };

  const openDaySheet = useCallback((date: string) => { setSelectedDate(date); setError(null); setNotice(null); }, []);

  useEffect(() => {
    if (loading || typeof openDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(openDate)) return;
    try { dayOrdinal(openDate); } catch { return; }
    const currentMonth = monthForLocalDate(getLocalToday(viewTimezone));
    const targetMonth = openDate.slice(0, 7);
    const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number);
    const [targetYear, targetMonthNumber] = targetMonth.split('-').map(Number);
    let active = true;
    void (async () => {
      try {
        const [plan, statusRows, notes] = await Promise.all([
          cycle ? getPlannedShiftForDate(database, cycle.id, openDate) : Promise.resolve(null),
          listWorkDayStatuses(database, openDate, openDate),
          listDayEditNotes(database, openDate, addLocalDays(openDate, 1)),
        ]);
        if (!active) return;
        setMonthOffset((targetYear - currentYear) * 12 + targetMonthNumber - currentMonthNumber);
        const status = statusRows[0] ?? null;
        setDayNotes((current) => { const next = new Map(current); const note = notes[0]?.note; if (note) next.set(openDate, note); else next.delete(openDate); return next; });
        setPlans((current) => [...current.filter((item) => item.localDate !== openDate), ...(plan ? [plan] : [])]);
        setStatuses((current) => { const next = new Map(current); if (status) next.set(openDate, status); else next.delete(openDate); return next; });
        setSelectedDate(openDate);
        setError(null); setNotice(null);
        router.setParams({ openDate: undefined });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Seçilen gün yüklenemedi.');
      }
    })();
    return () => { active = false; };
  }, [openDate, loading, cycle, database, router, viewTimezone]);

  const openAccount = () => { setMenu(null); router.push('/account'); };
  const openEarningsSettings = () => { setMenu(null); router.push('/earnings-settings'); };
  const openAppSettings = () => { setMenu(null); router.push('/(tabs)/settings'); };

  const statusForDate = (date: string) => recordsByDate.has(date) ? undefined : statuses.get(date)?.status;
  const openTimePicker = (field: 'start' | 'end') => {
    if ((field === 'start' && (Boolean(active) || saving)) || (field === 'end' && (!active || saving))) return;
    const selected = dateForTime(field === 'start' ? visibleStartTime : visibleEndTime);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selected, mode: 'time', is24Hour: true, timeZoneName: ZONE, display: 'clock',
        onValueChange: (_event, picked) => {
          if (!picked) return;
          if (field === 'start') { setStartTime(timeFromDate(picked)); setStartTimeEdited(true); }
          else { setEndTime(timeFromDate(picked)); setEndTimeEdited(true); setEndOccurrence(undefined); }
        },
        onError: () => setError('Saat seçici açılamadı. Daha sonra yeniden deneyin.'),
      });
    } else {
      setDraftTime(selected);
      setEditingTime(field);
    }
  };
  const todayPlanLabel = todayPlan?.kind === 'SHIFT' && todayTemplate ? `${todayTemplate.name} · ${todayTemplate.startLocalTime}–${todayTemplate.endLocalTime}`
    : todayPlan?.kind === 'OFF' ? 'OFF · planlı boş gün' : todayPlan?.kind === 'LEAVE' ? 'İzin' : 'Bu gün için plan yok';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" accessibilityElementsHidden={Boolean(selectedDate)} importantForAccessibility={selectedDate ? 'no-hide-descendants' : 'auto'}>
        <View style={styles.topBar}>
          <View style={styles.dateBlock}>
            <Text style={[styles.topDate, { color: theme.foreground }]}>{formatLocalDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.topTime, { color: theme.muted }]}>{localClock(now, viewTimezone)} · {viewTimezone}</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" onPress={() => setMenu(menu === 'notifications' ? null : 'notifications')} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons accessible={false} name="notifications-outline" size={19} color={theme.foreground} />
            </Pressable>
            <Pressable accessibilityRole="switch" accessibilityLabel="Koyu tema" accessibilityState={{ checked: mode === 'dark' }} onPress={() => void toggleMode().catch(() => setError('Tema tercihi kaydedilemedi. Yeniden deneyebilirsin.'))} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons accessible={false} name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={theme.accent} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Profil menüsü" onPress={() => setMenu(menu === 'profile' ? null : 'profile')} style={[styles.avatarButton, { backgroundColor: theme.accentSurface, borderColor: theme.border }]}>
              <Ionicons accessible={false} name="person-outline" size={19} color={theme.accent} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.weekCard, { backgroundColor: mode === 'dark' ? '#1B2B49' : '#1B3260', borderColor: mode === 'dark' ? '#34496D' : '#1B3260' }]}>
          <View style={styles.weekHeadingRow}>
            <View style={styles.flex}>
              <Text style={styles.cardEyebrow}>BU HAFTA</Text>
              <Text accessibilityRole="header" style={styles.weekTitle}>Vardiya planın</Text>
              <Text style={styles.weekRange}>{shortDate(weekStart)} – {shortDate(addLocalDays(weekEnd, -1))}</Text>
            </View>
            <Ionicons accessible={false} name="calendar-clear-outline" size={30} color="#C7D5FF" />
          </View>
          <View style={styles.weekStrip}>
            {weeklyPlans.map(({ date, plan, template }, index) => {
              const isShift = plan?.kind === 'SHIFT';
              const hour = template ? Number(template.startLocalTime.slice(0, 2)) : 8;
              const shiftName = isShift ? hour >= 15 && hour < 19 ? 'partly-sunny-outline' : hour >= 19 || hour < 6 ? 'moon-outline' : 'sunny-outline' : plan?.kind === 'LEAVE' || plan?.kind === 'OFF' ? 'bed-outline' : 'remove-outline';
              return <View key={date} accessible accessibilityLabel={`${formatLocalDate(date, { weekday: 'long' })}, ${isShift && template ? `${template.name}, ${template.startLocalTime}–${template.endLocalTime}` : plan?.kind === 'LEAVE' ? 'izin' : plan?.kind === 'OFF' ? 'OFF, planlı boş gün' : 'plan yok'}`} style={[styles.weekDay, date === today && styles.weekDayToday]}>
                <Text style={[styles.weekDayName, date === today && styles.weekDayTodayText]}>{WEEKDAYS[index]}</Text>
                <Ionicons accessible={false} name={shiftName as React.ComponentProps<typeof Ionicons>['name']} size={15} color={date === today ? '#233A72' : '#FFFFFF'} />
              </View>;
            })}
          </View>
          <View style={styles.weekSummary}>
            <Text style={styles.weekSummaryText}>{scheduledDays} vardiya · {durationLabel(scheduledMinutes)} planlı</Text>
            <Text style={styles.todayShiftLabel}>Bugün · {todayPlanLabel}</Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Mesai</Text>
              <Text style={[styles.sectionCaption, { color: theme.muted }]}>{active ? 'Mesain açık' : 'Başlangıç ve bitiş saatini kontrol et'}</Text>
            </View>
            {active ? <View style={[styles.livePill, { backgroundColor: theme.successSurface }]}><View style={[styles.liveDot, { backgroundColor: theme.success }]} /><Text style={{ color: theme.success, fontWeight: '800' }}>DEVAM EDİYOR</Text></View> : null}
          </View>
          <View style={styles.actionsRow}>
            <View style={[styles.actionColumn, styles.flex]}>
              <Text style={[styles.timeLabel, { color: theme.muted }]}>Başlangıç</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Başlangıç saatini seç, ${visibleStartTime}`} accessibilityState={{ disabled: Boolean(active) || saving }} disabled={Boolean(active) || saving} onPress={() => openTimePicker('start')} style={[styles.timeInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="time-outline" size={17} color={theme.accent} /><Text style={{ color: theme.foreground, fontSize: 16, fontWeight: '800' }}>{visibleStartTime}</Text><Ionicons name="chevron-down" size={15} color={theme.muted} /></Pressable>
              <SharedActionButton accessibilityLabel={active ? 'Mesai zaten başladı' : todayRecordAlreadyCompleted ? 'Bugünün çalışması tamamlandı' : 'Mesaiye başla'} label={todayRecordAlreadyCompleted ? 'Bugün tamamlandı' : 'Mesaiye Başla'} icon={todayRecordAlreadyCompleted ? 'checkmark-circle-outline' : 'play-circle-outline'} variant="success" compact neutralWhenDisabled disabled={!canStartClockIn(Boolean(active) || saving, todayRecordAlreadyCompleted)} onPress={() => void startShift()} />
            </View>
            <View style={[styles.actionColumn, styles.flex]}>
              <Text style={[styles.timeLabel, { color: theme.muted }]}>Bitiş</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Bitiş saatini seç, ${visibleEndTime}`} accessibilityState={{ disabled: !active || saving }} disabled={!active || saving} onPress={() => openTimePicker('end')} style={[styles.timeInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="time-outline" size={17} color={theme.accent} /><Text style={{ color: theme.foreground, fontSize: 16, fontWeight: '800' }}>{visibleEndTime}</Text><Ionicons name="chevron-down" size={15} color={theme.muted} /></Pressable>
              <SharedActionButton accessibilityLabel={active ? 'Mesaiyi bitir' : 'Mesai başlamadan bitirme kapalı'} label="Mesaiyi Bitir" icon="stop-circle-outline" variant="destructive" compact neutralWhenDisabled disabled={!active || saving} onPress={() => void finishShift()} />
            </View>
          </View>
          {active && activeStartLocal ? <Text style={[styles.clockCaption, { color: theme.muted }]}>Başlangıç kaydı {shortDate(active.startedLocalDate)} · {activeStartLocal.slice(11)} · {active.timezone}</Text> : null}
          {!active && todayRecordAlreadyCompleted ? <Pressable accessibilityRole="button" onPress={() => router.push('/work-records')}><Text style={[styles.clockCaption, { color: theme.accent, fontWeight: '700' }]}>Çalışma geçmişini aç · gerekirse ayrı kayıt ekle</Text></Pressable> : null}
          {endCandidates && endCandidates.candidates.length > 1 ? <View style={styles.choicesRow}>
            {(['earlier', 'later'] as const).map((choice, index) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ selected: endOccurrence === choice }} onPress={() => setEndOccurrence(choice)} style={[styles.choice, { backgroundColor: endOccurrence === choice ? theme.accentSurface : theme.surface, borderColor: endOccurrence === choice ? theme.accent : theme.border }]}>
              <Text style={{ color: theme.foreground, fontWeight: '700' }}>{index === 0 ? 'İlk' : 'İkinci'} oluşum</Text>
            </Pressable>)}
          </View> : null}
          {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: theme.danger }]}>{error}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: theme.success }]}>{notice}</Text> : null}
          {saving ? <View accessibilityLiveRegion="polite" style={styles.saving}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kaydediliyor…</Text></View> : null}
        </View>

        <View style={styles.calendarHeader}>
          <View style={styles.flex}>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Takvim</Text>
            <Text style={[styles.sectionCaption, { color: theme.muted }]}>Güne dokunarak ayrıntıları aç</Text>
          </View>
          <View style={styles.monthControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={() => setMonthOffset((value) => value - 1)} style={[styles.monthButton, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={{ color: theme.foreground, fontSize: 20 }}>‹</Text></Pressable>
            <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.foreground }]}>{formatMonthTitle(month)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Sonraki ay" onPress={() => setMonthOffset((value) => value + 1)} style={[styles.monthButton, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={{ color: theme.foreground, fontSize: 20 }}>›</Text></Pressable>
          </View>
        </View>

        {loading ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Takvim yükleniyor…</Text></View> : !cycle ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.foreground }]}>Vardiya düzenin hazır değil</Text>
            <Text style={[styles.sectionCaption, { color: theme.muted }]}>Bir düzen oluşturduğunda haftalık plan ve takvim burada görünür.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/settings')} style={[styles.linkButton, { backgroundColor: theme.primaryAction }]}><Text style={[styles.linkButtonText, { color: theme.onPrimaryAction }]}>Vardiya düzeni oluştur</Text></Pressable>
          </View>
        ) : (
          <View style={[styles.calendarCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.calendarGrid}>
              {WEEKDAYS.map((day) => <Text key={day} style={[styles.weekday, { color: theme.muted }]}>{day}</Text>)}
              {Array.from({ length: cellCount }, (_, index) => <View key={`blank-${index}`} style={styles.dayCell} />)}
              {monthDays.map((dayNumber) => {
                const date = localDateForMonthDay(month, dayNumber);
                const plan = plansByDate.get(date);
                const template = plan?.kind === 'SHIFT' ? templatesById.get(plan.templateId ?? '') : undefined;
                return <MiniCell key={date} date={date} plan={plan} template={template} status={statusForDate(date)} record={recordsByDate.get(date)?.[0]}
                  selected={date === selectedDate} onPress={() => openDaySheet(date)} theme={theme} />;
              })}
            </View>
            <View style={styles.legend}>
              <Legend color={theme.success} label="Çalışıldı" theme={theme} /><Legend color={theme.warning} label="İzin / rapor" theme={theme} /><Legend color={theme.danger} label="Gidilmedi" theme={theme} />
            </View>
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/calendar')} style={[styles.secondaryLink, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionCaption, { color: theme.foreground }]}>Takvim ve çalışma geçmişini aç</Text><Text style={{ color: theme.accent, fontSize: 18 }}>›</Text>
        </Pressable>
      </ScrollView>

      {selectedDate ? <DayEditSheet key={selectedDate} localDate={selectedDate} cycle={cycle} plan={selectedPlan}
        templates={templates} statusEntry={statuses.get(selectedDate)} note={dayNotes.get(selectedDate)} records={selectedRecords}
        onClose={() => setSelectedDate(null)} onSaved={async () => { setNotice('Değişiklikler kaydedildi; fiilî çalışma kayıtların korundu.'); await refreshRef.current?.(); }}
        onEditRecord={(recordId) => router.push({ pathname: '/work-records', params: { recordId } })}
        onCreateCycle={() => router.push('/(tabs)/settings')} /> : null}

      {menu ? <View style={styles.menuOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Menüyü kapat" onPress={() => setMenu(null)} style={styles.menuScrim} />
        <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {menu === 'notifications' ? <>
            <Text accessibilityRole="header" style={[styles.menuTitle, { color: theme.foreground }]}>Bildirimler</Text>
            <Text style={{ color: theme.muted, lineHeight: 21 }}>Henüz bildirimin yok.</Text>
            <MenuRow label="Kapat" onPress={() => setMenu(null)} theme={theme} />
          </> : <>
            <Text accessibilityRole="header" style={[styles.menuTitle, { color: theme.foreground }]}>Hesap ve ayarlar</Text>
            <MenuRow label="Giriş yap veya hesap oluştur" onPress={openAccount} theme={theme} />
            <MenuRow label="Ücret ve işyeri ayarları" onPress={openEarningsSettings} theme={theme} />
            <MenuRow label="Uygulama Ayarları" onPress={openAppSettings} theme={theme} />
          </>}
        </View>
      </View> : null}
      {Platform.OS === 'ios' ? <Modal visible={editingTime !== null} transparent animationType="slide" onRequestClose={() => setEditingTime(null)}>
        <View style={styles.pickerBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Saat seçiciyi kapat" onPress={() => setEditingTime(null)} style={styles.pickerScrim} /><View style={[styles.pickerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.foreground }]}>{editingTime === 'start' ? 'Başlangıç saati' : 'Bitiş saati'}</Text><Pressable accessibilityRole="button" onPress={() => setEditingTime(null)}><Text style={{ color: theme.accent, fontWeight: '800', padding: 10 }}>Kapat</Text></Pressable></View>
          <DateTimePicker value={draftTime} mode="time" display="spinner" locale="tr-TR" timeZoneName={ZONE} themeVariant={mode} onChange={(_event, picked) => { if (picked) setDraftTime(picked); }} />
          <Pressable accessibilityRole="button" style={[styles.pickerConfirm, { backgroundColor: theme.primaryAction }]} onPress={() => { if (editingTime === 'start') { setStartTime(timeFromDate(draftTime)); setStartTimeEdited(true); } else { setEndTime(timeFromDate(draftTime)); setEndTimeEdited(true); setEndOccurrence(undefined); } setEditingTime(null); }}><Text style={{ color: theme.onPrimaryAction, fontWeight: '800' }}>Saati seç</Text></Pressable>
        </View></View>
      </Modal> : null}
    </View>
  );
}

function Legend({ color, label, theme }: { color: string; label: string; theme: Theme }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={{ color: theme.muted, fontSize: 11 }}>{label}</Text></View>;
}

function MenuRow({ label, onPress, theme, destructive = false }: { label: string; onPress: () => void; theme: Theme; destructive?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.menuRow, { borderColor: theme.border }]}><Text style={{ color: destructive ? theme.danger : theme.foreground, fontWeight: '700' }}>{label}</Text><Text accessible={false} style={{ color: theme.muted }}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, screen: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, gap: 18 },
  flex: { flex: 1 }, topBar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateBlock: { flex: 1, gap: 3 }, topDate: { fontSize: 18, fontWeight: '800', textTransform: 'capitalize' }, topTime: { fontSize: 13 }, topActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 21, fontWeight: '700' }, avatarButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 17 },
  weekCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 12 }, weekHeadingRow: { flexDirection: 'row', alignItems: 'flex-start' }, cardEyebrow: { color: '#B9CBFF', fontSize: 11, letterSpacing: 1.4, fontWeight: '800' }, weekTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 3 }, weekRange: { color: '#D4DEFA', fontSize: 13, textTransform: 'capitalize', marginTop: 3 }, weekIcon: { color: '#C7D5FF', fontSize: 36, padding: 5 },
  weekStrip: { flexDirection: 'row', gap: 6 }, weekDay: { flex: 1, minHeight: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFFFFF1A' }, weekDayToday: { backgroundColor: '#FFFFFF' }, weekDayName: { color: '#D4DEFA', fontSize: 11, fontWeight: '700' }, weekDayTodayText: { color: '#233A72' }, weekSummary: { borderTopWidth: 1, borderTopColor: '#FFFFFF2A', paddingTop: 10, gap: 4 }, weekSummaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }, todayShiftLabel: { color: '#D4DEFA', fontSize: 13, lineHeight: 19 },
  actionSection: { gap: 12 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, sectionTitle: { fontSize: 21, fontWeight: '800' }, sectionCaption: { fontSize: 13, lineHeight: 19 }, livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, fontSize: 10 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, actionsRow: { flexDirection: 'row', gap: 10 }, actionColumn: { gap: 8, minWidth: 0 }, timeLabel: { fontSize: 12, fontWeight: '700' }, timeInput: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, clockCaption: { fontSize: 12, lineHeight: 18 }, saving: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 6 }, feedback: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  choicesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center' },
  calendarHeader: { gap: 10 }, monthControls: { flexDirection: 'row', alignItems: 'center', gap: 7 }, monthButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, monthTitle: { flex: 1, minWidth: 94, fontSize: 15, fontWeight: '800', textAlign: 'center', textTransform: 'capitalize' }, calendarCard: { borderWidth: 1, borderRadius: 20, padding: 10, gap: 9 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 6 }, dayCell: { width: '14.2857%', minHeight: 53, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 4, gap: 1, borderWidth: 1, borderColor: 'transparent', borderRadius: 10 }, dayNumber: { fontSize: 13, fontWeight: '700' }, dayMarker: { fontSize: 13, fontWeight: '900', lineHeight: 16 }, markerSpacer: { height: 16 }, delta: { fontSize: 9, fontWeight: '800' }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 5 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4 },
  loading: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 10 }, emptyCard: { borderWidth: 1, borderRadius: 18, padding: 17, gap: 10 }, cardTitle: { fontSize: 17, fontWeight: '800' }, linkButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, secondaryLink: { minHeight: 48, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  whiteText: { color: '#FFFFFF' },
  menuOverlay: { ...StyleSheet.absoluteFill, zIndex: 30 }, menuScrim: { ...StyleSheet.absoluteFill, backgroundColor: '#07101F33' }, menuCard: { position: 'absolute', top: 68, right: 14, width: 232, borderWidth: 1, borderRadius: 18, padding: 12, gap: 4, shadowColor: '#0B1730', shadowOpacity: 0.14, shadowRadius: 18, elevation: 6 }, menuTitle: { fontSize: 16, fontWeight: '800', padding: 7 }, menuRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth },
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end' }, pickerScrim: { ...StyleSheet.absoluteFill, backgroundColor: '#07101F66' }, pickerCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18, gap: 10 }, pickerConfirm: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
