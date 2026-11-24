import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getStartDatePromptDismissed, saveStartDatePromptDismissed } from '@/src/data/appPreferencesRepository';
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
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
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
          if (active) {
            setSettings(s);
            setPromptDismissed(dismissed);
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

  const leavePalette = shiftPalette.leave[mode];

  const todayDt = new Date(today.replace(/-/g, '/'));
  const todayName = WEEKDAY_NAMES[todayDt.getDay()] ?? '';
  const todayNumStr = today.split('-')[2] ?? '';
  const monthStr = MONTH_SHORT[todayDt.getMonth()] ?? '';
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 30, color: theme.ink, letterSpacing: -1, lineHeight: 36 }}>
            {todayName}
          </Text>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted, paddingBottom: 4 }}>
            {Number(todayNumStr)} {monthStr}
          </Text>
        </View>

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

        {/* Start-date prompt */}
        {!settings?.startDate && !promptDismissed && (
          <View style={{ backgroundColor: theme.surfaceMuted, borderRadius: layout.radius.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons accessible={false} name="briefcase-outline" size={18} color={theme.muted} />
            <Text style={{ flex: 1, color: theme.muted, fontSize: layout.type.caption, lineHeight: 18 }}>
              Yıllık izin hesabı için işe başlama tarihinizi girin.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ayarlar'dan girin"
              onPress={() => router.push('/(tabs)/settings' as never)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: layout.radius.control, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
            >
              <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.ink }}>Ayarlar</Text>
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
