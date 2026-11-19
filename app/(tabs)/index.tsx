import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { deriveDays, enumerateDays, type DerivedDay, type Settings } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekDates(center: string): string[] {
  const [y, m, d] = center.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const cy = cur.getFullYear();
    const cm = String(cur.getMonth() + 1).padStart(2, '0');
    const cd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${cy}-${cm}-${cd}`);
  }
  return dates;
}

const STATUS_LABELS: Record<string, string> = {
  WORKED: 'Çalışma günü',
  OFF: 'İzinli',
  LEAVE: 'İzin',
  HOLIDAY: 'Resmî tatil',
};

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const today = useMemo(todayLocal, []);
  const week = useMemo(() => weekDates(today), [today]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState<DerivedDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const s = await getSettings(database);
        const entries = await getDayEntriesInRange(database, week[0]!, week[6]!);
        const derived = deriveDays(week, entries, s);
        if (active) {
          setSettings(s);
          setDays(derived);
        }
      })();
      return () => { active = false; };
    }, [database, week]),
  );

  const selectedDay = days.find((d) => d.localDate === selectedDate);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: theme.foreground }]}>
          {settings ? formatTryMinor(settings.salaryMinor) + ' / ay' : ''}
        </Text>
      </View>

      <View style={styles.weekStrip}>
        {week.map((date) => {
          const dow = new Date(date.replace(/-/g, '/')).getDay();
          const day = days.find((d) => d.localDate === date);
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${DAY_LABELS[dow]} ${date.split('-')[2]}`}
              onPress={() => setSelectedDate(date)}
              style={[
                styles.weekDay,
                {
                  backgroundColor: isSelected ? theme.accentSurface : 'transparent',
                  borderColor: isToday ? theme.accent : 'transparent',
                },
              ]}
            >
              <Text style={[styles.weekDayLabel, { color: isSelected ? theme.accent : theme.muted }]}>
                {DAY_LABELS[dow]}
              </Text>
              <Text style={[styles.weekDayNumber, { color: isSelected ? theme.accent : theme.foreground }]}>
                {date.split('-')[2]}
              </Text>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      day?.status === 'WORKED' ? theme.success :
                      day?.status === 'HOLIDAY' ? theme.warning :
                      day?.status === 'LEAVE' ? theme.danger :
                      theme.border,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.detail}>
        {selectedDay && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>
              {STATUS_LABELS[selectedDay.status] ?? selectedDay.status}
            </Text>
            {selectedDay.leaveType && selectedDay.leaveType !== 'HOLIDAY' && (
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>
                İzin: {selectedDay.leaveType}{selectedDay.leaveHalfDay ? ' (yarım gün)' : ''}
              </Text>
            )}
            {selectedDay.overtimeMinutes > 0 && (
              <Text style={{ color: theme.warning, fontSize: layout.type.body }}>
                Fazla mesai: {Math.floor(selectedDay.overtimeMinutes / 60)} sa {selectedDay.overtimeMinutes % 60} dk
              </Text>
            )}
            {selectedDay.note && (
              <Text style={{ color: theme.muted, fontSize: layout.type.caption, marginTop: 4 }}>
                {selectedDay.note}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/day-edit', params: { date: selectedDate } })}
              style={[styles.editButton, { borderColor: theme.border }]}
            >
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>Düzenle</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: layout.screen.horizontal,
    marginBottom: 16,
  },
  greeting: {
    fontSize: layout.type.title,
    fontWeight: '800',
  },
  weekStrip: {
    flexDirection: 'row',
    paddingHorizontal: layout.screen.horizontal,
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  weekDay: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: layout.radius.control,
    borderWidth: 1.5,
    minWidth: 42,
    gap: 4,
  },
  weekDayLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  weekDayNumber: {
    fontSize: layout.type.body,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detail: {
    paddingHorizontal: layout.screen.horizontal,
    paddingBottom: layout.screen.bottom,
  },
  card: {
    borderRadius: layout.radius.card,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  cardTitle: {
    fontSize: layout.type.section,
    fontWeight: '700',
  },
  editButton: {
    borderWidth: 1,
    borderRadius: layout.radius.control,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
});
