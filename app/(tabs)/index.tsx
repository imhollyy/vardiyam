import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, type NativeSyntheticEvent, type NativeScrollEvent, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { listShiftTemplates, listShiftCycles } from '@/src/data/shiftCycleRepository';
import {
  deriveDays,
  resolvePlannedTemplates,
  enumerateDays,
  calculateAnnualLeave,
  calculateOvertime,
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
import { DayBlock, type DayBlockStatus } from '@/src/components/ui/DayBlock';
import { ShiftBlock, type ShiftBlockKind } from '@/src/components/ui/ShiftBlock';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { SkeletonCard } from '@/src/components/ui/Skeleton';

const WEEK_RANGE = 26;
const WEEK_CENTER = WEEK_RANGE;
const WEEK_OFFSETS = Array.from({ length: WEEK_RANGE * 2 + 1 }, (_, i) => i - WEEK_RANGE);

const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function weekDates(center: string): string[] {
  const [y, m, d] = center.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    return `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
  });
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toDayBlockStatus(day: DerivedDay | undefined): DayBlockStatus {
  if (!day) return 'off';
  if (day.status === 'WORKED') return day.overtimeMinutes > 0 ? 'overtime' : 'shift';
  if (day.status === 'LEAVE') return 'leave';
  if (day.status === 'HOLIDAY') return 'holiday';
  return 'off';
}

function toDayCode(day: DerivedDay | undefined): string {
  if (!day) return '—';
  if (day.status === 'WORKED') return 'G';
  if (day.status === 'LEAVE') return day.leaveType === 'ANNUAL' ? 'İZN' : 'İZ';
  if (day.status === 'HOLIDAY') return 'T';
  return '—';
}

function templateToKind(t: ShiftTemplate): ShiftBlockKind {
  const start = Number(t.startLocalTime.split(':')[0] ?? '8');
  if (start >= 6 && start < 14) return 'day';
  if (start >= 14 && start < 22) return 'evening';
  return 'night';
}

export default function HomeScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const today = useMemo(() => todayLocal(), []);
  const week = useMemo(() => weekDates(today), [today]);
  const [weekOffset, setWeekOffset] = useState(0);
  const flatListRef = useRef<FlatList<number>>(null);
  const stripWidth = screenWidth - layout.screen.horizontal * 2;
  const displayedMonday = useMemo(() => addDays(week[0]!, weekOffset * 7), [week, weekOffset]);
  const displayedWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(displayedMonday, i)), [displayedMonday]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dayMap, setDayMap] = useState<Map<string, DerivedDay>>(new Map());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plannedMap, setPlannedMap] = useState<Map<string, string | null>>(new Map());
  const [periodStatement, setPeriodStatement] = useState<MonthlyStatement | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const s = await getSettings(database);
          const tmpl = await listShiftTemplates(database);
          const cycles = await listShiftCycles(database);
          const rangeStart = displayedMonday < week[0]! ? displayedMonday : week[0]!;
          const baseEnd = addDays(week[6]!, 14);
          const dispEnd = addDays(displayedMonday, 6);
          const rangeEnd = baseEnd > dispEnd ? baseEnd : dispEnd;
          const entries = await getDayEntriesInRange(database, rangeStart, rangeEnd);
          const allDates = enumerateDays(rangeStart, rangeEnd);
          const derived = deriveDays(allDates, entries, s, tmpl, cycles);
          const planned = resolvePlannedTemplates(allDates, cycles, tmpl, entries);
          const { statement, period } = await loadCurrentPeriodStatement(database, today);
          if (active) {
            setSettings(s);
            setTemplates(tmpl);
            setDayMap(new Map(derived.map((d) => [d.localDate, d])));
            setPlannedMap(planned);
            setPeriodStatement(statement);
            setPeriodInfo(period);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, displayedMonday, today, week]),
  );

  const todayTemplateId = plannedMap.get(today);
  const todayTemplate = todayTemplateId ? (templates.find((t) => t.id === todayTemplateId) ?? null) : null;
  const todayDerived = dayMap.get(today);
  const todayIsSpecial = !todayTemplate && todayDerived && (todayDerived.status === 'HOLIDAY' || todayDerived.status === 'LEAVE');

  const weekDays = useMemo(() => week.map((d) => dayMap.get(d)).filter((d): d is DerivedDay => d !== undefined), [week, dayMap]);

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

  const annualLeaveResult = useMemo(() => {
    if (!settings?.startDate) return null;
    const usedDays = weekDays.filter((d) => d.leaveType === 'ANNUAL').length;
    return calculateAnnualLeave(settings.startDate, today, usedDays);
  }, [settings, weekDays, today]);

  const totalOvertimeMinutes = periodStatement
    ? (periodStatement.scheduledOvertimeMinutes + periodStatement.manualOvertimeMinutes)
    : 0;
  const overtimeMinor = settings && totalOvertimeMinutes > 0
    ? calculateOvertime(totalOvertimeMinutes, settings.salaryMinor)
    : 0;
  const lateEarlyMinutes = weekDays.reduce((s, d) => s + d.lateEarlyMinutes, 0);

  const weekRangeLabel = useMemo(() => {
    const start = displayedWeek[0]!;
    const end = displayedWeek[6]!;
    const startD = Number(start.split('-')[2]);
    const endD = Number(end.split('-')[2]);
    const startM = Number(start.split('-')[1]);
    const endM = Number(end.split('-')[1]);
    if (startM === endM) return `${startD} – ${endD} ${MONTH_SHORT[startM - 1] ?? ''}`;
    return `${startD} ${MONTH_SHORT[startM - 1] ?? ''} – ${endD} ${MONTH_SHORT[endM - 1] ?? ''}`;
  }, [displayedWeek]);
  const daysUntilPay = settings ? daysUntilPayday(today, settings.payday) : null;

  const todayDt = new Date(today.replace(/-/g, '/'));
  const todayName = WEEKDAY_NAMES[todayDt.getDay()] ?? '';
  const todayNumStr = today.split('-')[2] ?? '';
  const monthStr = MONTH_SHORT[todayDt.getMonth()] ?? '';

  const leavePalette = shiftPalette.leave[mode];

  if (loading) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: 32 }}
      >
        <SkeletonCard rows={1} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={4} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: 32 }}
    >
      {/* a) Başlık: gün adı büyük sol, tarih sağ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 30, color: theme.ink, letterSpacing: -1, lineHeight: 36 }}>
          {todayName}
        </Text>
        <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted, paddingBottom: 4 }}>
          {Number(todayNumStr)} {monthStr}
        </Text>
      </View>

      {/* b) ShiftBlock: bugünün vardiyası veya izin/tatil */}
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

      {/* c) Hafta şeridi: başlık + ok + FlatList yatay kaydırma */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Önceki hafta"
            onPress={() => {
              const next = weekOffset - 1;
              setWeekOffset(next);
              flatListRef.current?.scrollToIndex({ index: WEEK_CENTER + next, animated: true });
            }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.ink} />
          </Pressable>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.ink }}>
            {weekRangeLabel}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki hafta"
            onPress={() => {
              const next = weekOffset + 1;
              setWeekOffset(next);
              flatListRef.current?.scrollToIndex({ index: WEEK_CENTER + next, animated: true });
            }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-forward" size={20} color={theme.ink} />
          </Pressable>
        </View>
        {weekOffset !== 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setWeekOffset(0);
              flatListRef.current?.scrollToIndex({ index: WEEK_CENTER, animated: true });
            }}
            style={{ alignSelf: 'center' }}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.accent }}>
              Bu haftaya dön
            </Text>
          </Pressable>
        ) : null}
        <FlatList
          ref={flatListRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={WEEK_OFFSETS}
          keyExtractor={(item) => String(item)}
          initialScrollIndex={WEEK_CENTER}
          getItemLayout={(_, index) => ({ length: stripWidth, offset: stripWidth * index, index })}
          onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / stripWidth);
            setWeekOffset(idx - WEEK_CENTER);
          }}
          renderItem={({ item: itemOffset }) => {
            const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(week[0]!, itemOffset * 7 + i));
            const thisMonth = Number(thisWeek[3]!.split('-')[1]);
            return (
              <View style={{ width: stripWidth, flexDirection: 'row', gap: 6 }}>
                {thisWeek.map((date) => {
                  const dow = new Date(date.replace(/-/g, '/')).getDay();
                  const day = dayMap.get(date);
                  const dateNum = date.split('-')[2] ?? '';
                  const otMin = day?.overtimeMinutes ?? 0;
                  const faded = Number(date.split('-')[1]) !== thisMonth;
                  return (
                    <View key={date} style={{ flex: 1, opacity: faded ? 0.35 : 1 }}>
                      <DayBlock
                        dayLabel={DAY_LABELS[dow] ?? ''}
                        dateNumber={dateNum}
                        code={toDayCode(day)}
                        status={toDayBlockStatus(day)}
                        isToday={date === today}
                        hasOvertime={otMin > 0}
                        overtimeLabel={otMin > 0 ? `+${Math.floor(otMin / 60)}sa` : undefined}
                        onPress={() => router.push({ pathname: '/day-edit' as never, params: { date } })}
                      />
                    </View>
                  );
                })}
              </View>
            );
          }}
        />
      </View>

      {/* d) InkCard: Bu dönem tahmini + maaş hapı + mesai/eksik/izin */}
      <View>
        {daysUntilPay !== null ? (
          <View style={{ alignSelf: 'flex-end', marginBottom: 6, backgroundColor: theme.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5, borderRadius: layout.radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons accessible={false} name="calendar-outline" size={12} color={theme.muted} />
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, color: theme.muted }}>
              Maaşa {daysUntilPay} gün
            </Text>
          </View>
        ) : null}
        <InkCard
          eyebrow={periodInfo?.label ?? 'Bu dönem tahmini'}
          amount={periodStatement ? formatTryMinor(periodStatement.netMinor) : '—'}
          daysLabel={periodStatement ? `${periodStatement.workedDays} gün` : undefined}
        >
          <InkCardRow>
            <InkCardStat
              label="Mesai"
              value={totalOvertimeMinutes > 0 ? `+${formatTryMinor(overtimeMinor)}` : '0 ₺'}
            />
            <InkCardStat
              label="Eksik saat"
              value={lateEarlyMinutes > 0 ? `−${Math.round(lateEarlyMinutes / 60 * 10) / 10} sa` : '—'}
            />
            <InkCardStat
              label="İzin kalan"
              value={annualLeaveResult ? `${annualLeaveResult.remainingDays} gün` : 'Tarih gir'}
            />
          </InkCardRow>
        </InkCard>
      </View>

      {/* e) Ek gelir ekle ikincil buton */}
      <ActionButton
        label="Ek gelir ekle"
        variant="secondary"
        icon="cash-outline"
        onPress={() => router.push('/additional-income' as never)}
      />
    </ScrollView>
  );
}
