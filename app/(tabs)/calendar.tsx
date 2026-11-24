import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { listShiftCycles, listShiftTemplates } from '@/src/data/shiftCycleRepository';
import type { ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { deriveDays, enumerateDays, type DerivedDay } from '@/src/domain/payroll/index';
import type { LeaveType } from '@/src/domain/payroll/types';
import { buildMonthEventLists } from '@/src/features/reports/buildMonthEventLists';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card } from '@/src/components/ui/Card';
import { StatTile } from '@/src/components/ui/StatTile';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { SkeletonCard } from '@/src/components/ui/Skeleton';
import { MonthGrid } from '@/src/components/calendar/MonthGrid';
import { BottomSheet } from '@/src/components/ui/BottomSheet';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const LEAVE_LABELS: Record<LeaveType, string> = {
  ANNUAL: 'Yıllık izin', UNPAID: 'Ücretsiz izin', SICK: 'Hastalık raporu',
  EXCUSE: 'Mazeret izni', MATERNITY: 'Doğum izni', BEREAVEMENT: 'Ölüm izni',
  SOCIAL: 'Sosyal izin', HOURLY: 'Saatlik izin', HOLIDAY: 'Resmî tatil',
};

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = WEEKDAY_SHORT[(date.getDay() + 6) % 7] ?? '';
  const mn = MONTH_NAMES[m - 1] ?? '';
  return `${dow} ${d} ${mn}`;
}

function fmtMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min > 0 ? `${h} sa ${min} dk` : `${h} sa`;
}

type SheetKind = 'leave' | 'overtime' | 'lateEarly' | null;

export default function CalendarScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const today = useMemo(() => todayLocal(), []);
  const [year, setYear] = useState(() => Number(today.split('-')[0]));
  const [month, setMonth] = useState(() => Number(today.split('-')[1]));
  const [dayMap, setDayMap] = useState<Map<string, DerivedDay>>(new Map());
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [sheet, setSheet] = useState<SheetKind>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const [s, tmpl, cycles] = await Promise.all([
            getSettings(database),
            listShiftTemplates(database),
            listShiftCycles(database),
          ]);
          const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
          const daysInMonth = new Date(year, month, 0).getDate();
          const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
          const entries = await getDayEntriesInRange(database, startDate, endDate);
          const dates = enumerateDays(startDate, endDate);
          const derived = deriveDays(dates, entries, s, tmpl, cycles);
          if (active) {
            setDayMap(new Map(derived.map((d) => [d.localDate, d])));
            setTemplates(tmpl);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, year, month]),
  );

  const prevMonth = useCallback(() => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }, [month]);

  const prevMonthRef = useRef(prevMonth);
  const nextMonthRef = useRef(nextMonth);
  useEffect(() => { prevMonthRef.current = prevMonth; }, [prevMonth]);
  useEffect(() => { nextMonthRef.current = nextMonth; }, [nextMonth]);

  // eslint-disable-next-line react-hooks/refs -- PanResponder release handler is not render-time code
  const [panHandlers] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < Math.abs(gs.dx),
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -50) nextMonthRef.current();
      else if (gs.dx > 50) prevMonthRef.current();
    },
  }).panHandlers);

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const days = useMemo(() => Array.from(dayMap.values()), [dayMap]);

  const eventLists = useMemo(() => buildMonthEventLists(days), [days]);

  const worked = days.filter((d) => d.status === 'WORKED').length;
  const overtime = days.reduce((s, d) => s + d.overtimeMinutes, 0);
  const leave = days.filter((d) => d.status === 'LEAVE').length;
  const lateEarlyCount = days.filter((d) => d.lateEarlyMinutes > 0).length;

  if (loading) {
    return (
      <Screen>
        <SkeletonCard rows={3} />
        <SkeletonCard rows={6} />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Month navigation header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PageHeading eyebrow="TAKVİM" title={`${MONTH_NAMES[month - 1]} ${year}`} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Önceki ay"
            onPress={prevMonth}
            style={{ width: 44, height: 44, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={18} color={theme.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki ay"
            onPress={nextMonth}
            style={{ width: 44, height: 44, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.ink} />
          </Pressable>
        </View>
      </View>

      {/* Calendar grid with swipe */}
      <Card>
        <View {...panHandlers}>
          <MonthGrid
            year={year}
            month={month}
            today={today}
            dayMap={dayMap}
            templateMap={templateMap}
            theme={theme}
            mode={mode === 'dark' ? 'dark' : 'light'}
            onDayPress={(date) => router.push({ pathname: '/day-edit' as never, params: { date } })}
          />
        </View>
      </Card>

      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
        {(['day', 'evening', 'night', 'leave', 'holiday'] as const).map((kind) => (
          <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: shiftPalette[kind][mode === 'dark' ? 'dark' : 'light'].background }} />
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted }}>
              {kind === 'day' ? 'Gündüz' : kind === 'evening' ? 'Akşam' : kind === 'night' ? 'Gece' : kind === 'leave' ? 'İzin' : 'Tatil'}
            </Text>
          </View>
        ))}
      </View>

      {/* Month summary — tappable */}
      <Card>
        <View style={{ flexDirection: 'row', gap: layout.space.md }}>
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`İzin: ${leave} gün, detayları gör`}
            onPress={() => setSheet('leave')}
          >
            <StatTile value={String(leave)} label="İzin" tone="danger" />
          </Pressable>
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`Fazla mesai: ${overtime > 0 ? Math.floor(overtime / 60) + ' sa' : '0'}, detayları gör`}
            onPress={() => setSheet('overtime')}
          >
            <StatTile value={overtime > 0 ? `${Math.floor(overtime / 60)}sa` : '0'} label="Fazla mesai" tone="warning" />
          </Pressable>
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={`Geç/erken: ${lateEarlyCount}, detayları gör`}
            onPress={() => setSheet('lateEarly')}
          >
            <StatTile value={String(lateEarlyCount)} label="Geç/erken" tone="danger" />
          </Pressable>
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center', marginTop: 8 }}>
          Çalışılan: {worked} gün · Detay için dokunun
        </Text>
      </Card>

      {/* Leave BottomSheet */}
      <BottomSheet visible={sheet === 'leave'} onClose={() => setSheet(null)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 8 }}>
          {MONTH_NAMES[month - 1]} — İzinler
        </Text>
        {eventLists.leaves.length === 0 ? (
          <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.body, paddingVertical: 16, textAlign: 'center' }}>
            Bu ay izin yok
          </Text>
        ) : (
          eventLists.leaves.map((ev) => (
            <Pressable
              key={ev.localDate}
              accessibilityRole="button"
              onPress={() => { setSheet(null); router.push({ pathname: '/day-edit' as never, params: { date: ev.localDate } }); }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>
                    {formatDate(ev.localDate)}
                  </Text>
                  <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption, marginTop: 2 }}>
                    {LEAVE_LABELS[ev.leaveType] ?? ev.leaveType}
                    {ev.leaveHalfDay ? ' · Yarım gün' : ''}
                    {ev.leaveType === 'HOURLY' && ev.leaveHours > 0 ? ` · ${ev.leaveHours} sa` : ''}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: ev.deducted ? theme.danger : theme.success }}>
                  {ev.deducted ? 'Kesilir' : 'Kesilmez'}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </BottomSheet>

      {/* Overtime BottomSheet */}
      <BottomSheet visible={sheet === 'overtime'} onClose={() => setSheet(null)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 8 }}>
          {MONTH_NAMES[month - 1]} — Fazla Mesai
        </Text>
        {eventLists.overtime.length === 0 ? (
          <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.body, paddingVertical: 16, textAlign: 'center' }}>
            Bu ay fazla mesai yok
          </Text>
        ) : (
          eventLists.overtime.map((ev) => (
            <Pressable
              key={ev.localDate}
              accessibilityRole="button"
              onPress={() => { setSheet(null); router.push({ pathname: '/day-edit' as never, params: { date: ev.localDate } }); }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>
                  {formatDate(ev.localDate)}
                </Text>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.warning, fontSize: layout.type.body }}>
                  +{fmtMin(ev.overtimeMinutes)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </BottomSheet>

      {/* Late/Early BottomSheet */}
      <BottomSheet visible={sheet === 'lateEarly'} onClose={() => setSheet(null)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 8 }}>
          {MONTH_NAMES[month - 1]} — Geç/Erken
        </Text>
        {eventLists.lateEarly.length === 0 ? (
          <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.body, paddingVertical: 16, textAlign: 'center' }}>
            Bu ay geç/erken yok
          </Text>
        ) : (
          eventLists.lateEarly.map((ev) => (
            <Pressable
              key={ev.localDate}
              accessibilityRole="button"
              onPress={() => { setSheet(null); router.push({ pathname: '/day-edit' as never, params: { date: ev.localDate } }); }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>
                  {formatDate(ev.localDate)}
                </Text>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.danger, fontSize: layout.type.body }}>
                  −{fmtMin(ev.lateEarlyMinutes)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </BottomSheet>
    </Screen>
  );
}
