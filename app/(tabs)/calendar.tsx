import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { deriveDays, enumerateDays, type DerivedDay, type Settings } from '@/src/domain/payroll/index';
import { isOfficialHoliday, getHolidayName } from '@/src/config/holidays';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthDays(year: number, month: number): (string | null)[] {
  const first = new Date(year, month - 1, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: startDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function CalendarScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const today = useMemo(todayLocal, []);
  const [year, setYear] = useState(() => Number(today.split('-')[0]));
  const [month, setMonth] = useState(() => Number(today.split('-')[1]));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dayMap, setDayMap] = useState<Map<string, DerivedDay>>(new Map());

  const cells = useMemo(() => monthDays(year, month), [year, month]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const s = await getSettings(database);
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        const entries = await getDayEntriesInRange(database, startDate, endDate);
        const dates = enumerateDays(startDate, endDate);
        const derived = deriveDays(dates, entries, s);
        const map = new Map(derived.map((d) => [d.localDate, d]));
        if (active) {
          setSettings(s);
          setDayMap(map);
        }
      })();
      return () => { active = false; };
    }, [database, year, month]),
  );

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={prevMonth} style={styles.navButton}>
          <Text style={{ color: theme.accent, fontSize: 22, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: theme.foreground }]}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki ay" onPress={nextMonth} style={styles.navButton}>
          <Text style={{ color: theme.accent, fontSize: 22, fontWeight: '700' }}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekHeaders}>
        {WEEKDAY_HEADERS.map((h) => (
          <Text key={h} style={[styles.weekHeader, { color: theme.muted }]}>{h}</Text>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e-${i}`} style={styles.cell} />;
          const day = dayMap.get(date);
          const isToday = date === today;
          const dotColor =
            day?.status === 'WORKED' ? theme.success :
            day?.status === 'HOLIDAY' ? theme.warning :
            day?.status === 'LEAVE' ? theme.danger :
            theme.border;
          return (
            <View
              key={date}
              style={[
                styles.cell,
                isToday && { borderColor: theme.accent, borderWidth: 1.5, borderRadius: 8 },
              ]}
            >
              <Text style={[styles.cellText, { color: isToday ? theme.accent : theme.foreground }]}>
                {date.split('-')[2]}
              </Text>
              <View style={[styles.cellDot, { backgroundColor: dotColor }]} />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: layout.screen.horizontal,
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: layout.type.section,
    fontWeight: '800',
  },
  weekHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: layout.type.caption,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellText: {
    fontSize: layout.type.body,
    fontWeight: '600',
  },
  cellDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
