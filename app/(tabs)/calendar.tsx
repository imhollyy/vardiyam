import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { deriveDays, enumerateDays, type DerivedDay } from '@/src/domain/payroll/index';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { StatTile } from '@/src/components/ui/StatTile';
import { PageHeading } from '@/src/components/ui/PageHeading';

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
        if (active) setDayMap(map);
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

  const worked = Array.from(dayMap.values()).filter((d) => d.status === 'WORKED').length;
  const overtime = Array.from(dayMap.values()).reduce((s, d) => s + d.overtimeMinutes, 0);
  const leave = Array.from(dayMap.values()).filter((d) => d.status === 'LEAVE').length;

  return (
    <Screen>
      <PageHeading eyebrow="TAKVİM" title={`${MONTH_NAMES[month - 1]} ${year}`} />

      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={prevMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={theme.accent} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki ay" onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={theme.accent} />
        </Pressable>
      </View>

      <Card>
        <View style={styles.weekHeaders}>
          {WEEKDAY_HEADERS.map((h) => (
            <Text key={h} style={[styles.weekHeader, { color: theme.muted }]}>{h}</Text>
          ))}
        </View>
        <View style={styles.grid}>
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
                accessibilityLabel={`${date.split('-')[2]}, ${day?.status ?? 'OFF'}`}
                style={[styles.cell, isToday && { borderColor: theme.accent, borderWidth: 1.5, borderRadius: 10 }]}
              >
                <Text style={[styles.cellText, { color: isToday ? theme.accent : theme.foreground }]}>
                  {date.split('-')[2]}
                </Text>
                <View style={[styles.cellDot, { backgroundColor: dotColor }]} />
              </View>
            );
          })}
        </View>
      </Card>

      <View style={styles.legend}>
        <LegendItem color={theme.success} label="Çalışma" />
        <LegendItem color={theme.warning} label="Tatil" />
        <LegendItem color={theme.danger} label="İzin" />
        <LegendItem color={theme.border} label="OFF" />
      </View>

      <Card>
        <CardHeader icon="pie-chart-outline" title="Ay Özeti" />
        <View style={styles.statRow}>
          <StatTile value={String(worked)} label="Çalışılan" tone="success" style={{ flex: 1 }} />
          <StatTile value={overtime > 0 ? `${Math.floor(overtime / 60)}sa` : '0'} label="Fazla mesai" tone="warning" style={{ flex: 1 }} />
          <StatTile value={String(leave)} label="İzin" tone="danger" style={{ flex: 1 }} />
        </View>
      </Card>
    </Screen>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
  navButton: { padding: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  weekHeaders: { flexDirection: 'row' },
  weekHeader: { flex: 1, textAlign: 'center', fontSize: layout.type.caption, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellText: { fontSize: layout.type.body, fontWeight: '600' },
  cellDot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: layout.type.caption, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: layout.space.md },
});
