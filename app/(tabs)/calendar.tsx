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
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card } from '@/src/components/ui/Card';
import { StatTile } from '@/src/components/ui/StatTile';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { SkeletonCard } from '@/src/components/ui/Skeleton';
import { MonthGrid } from '@/src/components/calendar/MonthGrid';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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

  const worked = Array.from(dayMap.values()).filter((d) => d.status === 'WORKED').length;
  const overtime = Array.from(dayMap.values()).reduce((s, d) => s + d.overtimeMinutes, 0);
  const leave = Array.from(dayMap.values()).filter((d) => d.status === 'LEAVE').length;

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
            style={{ width: 36, height: 36, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={18} color={theme.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki ay"
            onPress={nextMonth}
            style={{ width: 36, height: 36, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
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

      {/* Month summary */}
      <Card>
        <View style={{ flexDirection: 'row', gap: layout.space.md }}>
          <StatTile value={String(worked)} label="Çalışılan" tone="success" style={{ flex: 1 }} />
          <StatTile value={overtime > 0 ? `${Math.floor(overtime / 60)}sa` : '0'} label="Fazla mesai" tone="warning" style={{ flex: 1 }} />
          <StatTile value={String(leave)} label="İzin" tone="danger" style={{ flex: 1 }} />
        </View>
      </Card>
    </Screen>
  );
}
