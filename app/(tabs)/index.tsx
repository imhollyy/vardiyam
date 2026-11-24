import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { getStartDatePromptDismissed, saveStartDatePromptDismissed, getCoachmarkDismissed, saveCoachmarkDismissed } from '@/src/data/appPreferencesRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { listShiftTemplates, listShiftCycles } from '@/src/data/shiftCycleRepository';
import {
  deriveDays,
  resolvePlannedTemplates,
  enumerateDays,
  daysUntilPayday,
  type DerivedDay,
  type MonthlyStatement,
  type Settings,
} from '@/src/domain/payroll/index';
import type { ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadCurrentPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { ShiftBlock, type ShiftBlockKind } from '@/src/components/ui/ShiftBlock';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { SkeletonCard } from '@/src/components/ui/Skeleton';
import { MonthGrid } from '@/src/components/calendar/MonthGrid';

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function templateToKind(t: ShiftTemplate): ShiftBlockKind {
  const start = Number(t.startLocalTime.split(':')[0] ?? '8');
  if (start >= 6 && start < 14) return 'day';
  if (start >= 14 && start < 22) return 'evening';
  return 'night';
}

const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function HomeScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const today = useMemo(() => todayLocal(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dayMap, setDayMap] = useState<Map<string, DerivedDay>>(new Map());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plannedMap, setPlannedMap] = useState<Map<string, string | null>>(new Map());
  const [periodStatement, setPeriodStatement] = useState<MonthlyStatement | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [coachmarkVisible, setCoachmarkVisible] = useState(false);
  const [startDateSheetVisible, setStartDateSheetVisible] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState(today);

  const todayYear = Number(today.split('-')[0]);
  const todayMonth = Number(today.split('-')[1]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const s = await getSettings(database);
          const dismissed = await getStartDatePromptDismissed(database);
          const tmpl = await listShiftTemplates(database);
          const cycles = await listShiftCycles(database);
          const monthStart = `${todayYear}-${String(todayMonth).padStart(2, '0')}-01`;
          const daysInMonth = new Date(todayYear, todayMonth, 0).getDate();
          const monthEnd = `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
          // Extend range 14 days forward for next-shift lookup
          const rangeEnd = addDays(monthEnd, 14);
          const entries = await getDayEntriesInRange(database, monthStart, rangeEnd);
          const allDates = enumerateDays(monthStart, rangeEnd);
          const derived = deriveDays(allDates, entries, s, tmpl, cycles);
          const planned = resolvePlannedTemplates(allDates, cycles, tmpl, entries);
          const { statement, period } = await loadCurrentPeriodStatement(database, today);
          const coachDismissed = await getCoachmarkDismissed(database, 'coachmark_home_v1');
          if (active) {
            setSettings(s);
            setPromptDismissed(dismissed);
            setTemplates(tmpl);
            setDayMap(new Map(derived.map((d) => [d.localDate, d])));
            setPlannedMap(planned);
            setPeriodStatement(statement);
            setPeriodInfo(period);
            if (!coachDismissed) setCoachmarkVisible(true);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, today, todayYear, todayMonth]),
  );

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const todayTemplateId = plannedMap.get(today);
  const todayTemplate = todayTemplateId ? (templates.find((t) => t.id === todayTemplateId) ?? null) : null;
  const todayDerived = dayMap.get(today);
  const todayIsSpecial = !todayTemplate && todayDerived && (todayDerived.status === 'HOLIDAY' || todayDerived.status === 'LEAVE');

  const nextShiftLabel = useMemo(() => {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i);
      const tmplId = plannedMap.get(d);
      if (tmplId) {
        const t = templates.find((x) => x.id === tmplId);
        if (t) {
          const dow = new Date(d.replace(/-/g, '/')).getDay();
          return `${WEEKDAY_NAMES[dow] ?? ''}: ${t.startLocalTime} – ${t.endLocalTime}`;
        }
      }
    }
    return null;
  }, [plannedMap, templates, today]);

  const daysUntilPay = settings ? daysUntilPayday(today, settings.payday) : null;

  const hasAnyEntry = useMemo(() => {
    for (const d of dayMap.values()) {
      if (d.overtimeMinutes > 0 || d.lateEarlyMinutes > 0 || d.leaveType !== null) return true;
    }
    return false;
  }, [dayMap]);

  const startDate = settings?.startDate ?? null;
  const daysSinceStart = useMemo(() => {
    if (!startDate) return null;
    const [sy, sm, sd] = startDate.split('-').map(Number) as [number, number, number];
    const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
    const diff = new Date(ty, tm - 1, td).getTime() - new Date(sy, sm - 1, sd).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [startDate, today]);

  const leavePalette = shiftPalette.leave[mode];

  const todayDt = new Date(today.replace(/-/g, '/'));
  const todayName = WEEKDAY_NAMES[todayDt.getDay()] ?? '';
  const monthName = MONTH_NAMES[todayMonth - 1] ?? '';

  if (loading) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: 100 }}
      >
        <SkeletonCard rows={1} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={4} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: 100 }}
      >
        {/* Header */}
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 30, color: theme.ink, letterSpacing: -1, lineHeight: 36 }}>
          {todayName}
        </Text>

        {/* Big answer card — taps to Earnings */}
        <InkCard
          eyebrow={periodInfo?.label ?? 'Bu dönem tahmini'}
          amount={periodStatement ? `≈ ${formatTryMinor(periodStatement.netMinor)}` : '—'}
          daysLabel={daysUntilPay !== null ? `${daysUntilPay} gün kaldı` : undefined}
          onPress={() => router.push('/(tabs)/earnings' as never)}
        >
          {periodStatement ? (
            <InkCardRow>
              <InkCardStat
                label="Çalışılan"
                value={`${periodStatement.workedDays} gün`}
              />
              <InkCardStat
                label="Mesai"
                value={periodStatement.scheduledOvertimeMinutes + periodStatement.manualOvertimeMinutes > 0
                  ? `+${Math.floor((periodStatement.scheduledOvertimeMinutes + periodStatement.manualOvertimeMinutes) / 60)}sa`
                  : '0'}
              />
            </InkCardRow>
          ) : null}
        </InkCard>

        {/* Today's shift block */}
        {todayIsSpecial ? (
          <View style={{ backgroundColor: leavePalette.background, borderRadius: layout.radius.block, padding: 20, gap: 10 }}>
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, color: leavePalette.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
              BUGÜN
            </Text>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: leavePalette.text }}>
              {todayDerived?.status === 'HOLIDAY' ? 'Bugün resmi tatil' : 'Bugün izinlisin'}
            </Text>
            {nextShiftLabel ? (
              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: leavePalette.textSecondary }}>
                Sonraki vardiya: {nextShiftLabel}
              </Text>
            ) : null}
          </View>
        ) : (
          <ShiftBlock
            kind={todayTemplate ? templateToKind(todayTemplate) : 'day'}
            shiftName={todayTemplate?.name ?? 'Bugün'}
            timeRange={todayTemplate ? `${todayTemplate.startLocalTime} – ${todayTemplate.endLocalTime}` : undefined}
            breakLabel={todayTemplate?.breakMinutes ? `${todayTemplate.breakMinutes} dk mola` : undefined}
            onChangePress={() => router.push('/shift-change' as never)}
            primaryLabel="Mesai / izin ekle"
            onPrimaryPress={() => router.push({ pathname: '/day-edit' as never, params: { date: today } })}
            nextShiftLabel={nextShiftLabel ? `Sonraki: ${nextShiftLabel}` : undefined}
          />
        )}

        {/* Empty state */}
        {!hasAnyEntry && settings?.setupCompleted && (
          <View style={{ backgroundColor: theme.surfaceMuted, borderRadius: layout.radius.card, padding: layout.space.lg, alignItems: 'center', gap: layout.space.sm }}>
            <Ionicons name="calendar-outline" size={32} color={theme.muted} accessible={false} />
            <Text style={{ fontFamily: fonts.bold, fontSize: layout.type.section, color: theme.ink, textAlign: 'center' }}>
              {daysSinceStart !== null && daysSinceStart <= 7 ? 'Henüz gün eklenmedi' : 'Bu ayki mesailerini ekledin mi?'}
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: theme.muted, textAlign: 'center' }}>
              Bir güne dokunarak mesai veya izin ekleyebilirsin
            </Text>
          </View>
        )}

        {/* Start-date prompt */}
        {!settings?.startDate && !promptDismissed && (
          <View style={{ backgroundColor: theme.surfaceMuted, borderRadius: layout.radius.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons accessible={false} name="briefcase-outline" size={18} color={theme.muted} />
            <Text style={{ flex: 1, color: theme.muted, fontSize: layout.type.caption, lineHeight: 18 }}>
              Yıllık izin hesabı için işe başlama tarihinizi girin.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tarih gir"
              onPress={() => {
                setStartDateDraft(today);
                setStartDateSheetVisible(true);
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: layout.radius.control, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
            >
              <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.ink }}>Tarih gir</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="İstemiyorum"
              onPress={() => {
                setPromptDismissed(true);
                void saveStartDatePromptDismissed(database);
              }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={16} color={theme.muted} />
            </Pressable>
          </View>
        )}

        {/* Monthly calendar grid */}
        <View style={{ backgroundColor: theme.surface, borderRadius: layout.radius.card, padding: layout.space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: layout.space.sm }}>
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.section, color: theme.ink }}>
              {monthName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Takvim sekmesine git"
              onPress={() => router.push('/(tabs)/calendar' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}
            >
              <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.accent }}>Tümü</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.accent} />
            </Pressable>
          </View>
          <MonthGrid
            year={todayYear}
            month={todayMonth}
            today={today}
            dayMap={dayMap}
            templateMap={templateMap}
            theme={theme}
            mode={mode === 'dark' ? 'dark' : 'light'}
            onDayPress={(date) => router.push({ pathname: '/day-edit' as never, params: { date } })}
          />
        </View>

        {/* Ek gelir */}
        <ActionButton
          label="Ek gelir ekle"
          variant="secondary"
          icon="cash-outline"
          onPress={() => router.push('/additional-income' as never)}
        />
      </ScrollView>

      {/* Home coachmark — shown once after setup */}
      {coachmarkVisible && (
        <View style={{ position: 'absolute', bottom: 92, right: 16, maxWidth: 240, backgroundColor: theme.ink, borderRadius: layout.radius.card, padding: 14, gap: 8 }}>
          <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: theme.onInk, lineHeight: 20 }}>
            Günü düzenlemek için bir güne dokun veya + düğmesine bas
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tamam, anladım"
            onPress={() => {
              setCoachmarkVisible(false);
              void saveCoachmarkDismissed(database, 'coachmark_home_v1');
            }}
            style={{ alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control, backgroundColor: theme.onInk }}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.ink }}>Tamam</Text>
          </Pressable>
        </View>
      )}

      {/* Start-date BottomSheet */}
      <BottomSheet visible={startDateSheetVisible} onClose={() => setStartDateSheetVisible(false)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink }}>
          İşe başlama tarihi
        </Text>
        <DateTimePickerField
          mode="date"
          label="Tarih"
          value={startDateDraft}
          timezone="Europe/Istanbul"
          onChange={setStartDateDraft}
          maximumDate={new Date()}
        />
        <View style={{ flexDirection: 'row', gap: layout.space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Şimdi değil"
            onPress={() => setStartDateSheetVisible(false)}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: layout.radius.control, borderWidth: 1, borderColor: theme.border }}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.ink }}>Şimdi değil</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kaydet"
            onPress={() => {
              void (async () => {
                await updateSettings(database, { startDate: startDateDraft });
                setSettings((s) => s ? { ...s, startDate: startDateDraft } : s);
                setPromptDismissed(true);
                void saveStartDatePromptDismissed(database);
                setStartDateSheetVisible(false);
              })();
            }}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: layout.radius.control, backgroundColor: theme.accent }}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.onInk }}>Kaydet</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* FAB — mesai/izin ekle for today */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bugün için mesai veya izin ekle"
        onPress={() => router.push({ pathname: '/day-edit' as never, params: { date: today } })}
        style={({ pressed }) => ({
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 6,
        })}
      >
        <Ionicons name="add" size={28} color={theme.onInk} accessible={false} />
      </Pressable>
    </View>
  );
}
