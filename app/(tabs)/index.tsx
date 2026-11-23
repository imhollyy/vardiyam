import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { deriveDays, type DerivedDay, type MonthlyStatement, type Settings } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadCurrentPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { StatTile } from '@/src/components/ui/StatTile';
import { ActionButton } from '@/src/components/ui/ActionButton';

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

function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function formatDate(localDate: string): string {
  const [y, m, d] = localDate.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

const STATUS_LABELS: Record<string, string> = {
  WORKED: 'Çalışma günü',
  OFF: 'İzinli',
  LEAVE: 'İzin',
  HOLIDAY: 'Resmî tatil',
};

const STATUS_ICONS: Record<string, { name: React.ComponentProps<typeof Ionicons>['name']; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  WORKED: { name: 'checkmark-circle', tone: 'success' },
  HOLIDAY: { name: 'flag', tone: 'warning' },
  LEAVE: { name: 'bed', tone: 'danger' },
  OFF: { name: 'moon', tone: 'muted' },
};

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const today = useMemo(() => todayLocal(), []);
  const week = useMemo(() => weekDates(today), [today]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState<DerivedDay[]>([]);
  const [periodStatement, setPeriodStatement] = useState<MonthlyStatement | null>(null);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const s = await getSettings(database);
          const entries = await getDayEntriesInRange(database, week[0]!, week[6]!);
          const derived = deriveDays(week, entries, s);
          const { statement, period } = await loadCurrentPeriodStatement(database, today);
          if (active) {
            setSettings(s);
            setDays(derived);
            setPeriodStatement(statement);
            setPeriodInfo(period);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, week, today]),
  );

  const selectedDay = days.find((d) => d.localDate === selectedDate);
  const statusInfo = STATUS_ICONS[selectedDay?.status ?? 'OFF'] ?? STATUS_ICONS.OFF!;

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Greeting + date */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greeting, { color: theme.foreground }]}>{formatGreeting()}</Text>
          <Text style={[styles.dateText, { color: theme.muted }]}>{formatDate(today)}</Text>
        </View>
        {settings && (
          <View style={[styles.salaryBadge, { backgroundColor: theme.accentSurface }]}>
            <Ionicons accessible={false} name="wallet" size={14} color={theme.accent} />
            <Text style={[styles.salaryText, { color: theme.accent }]}>{formatTryMinor(settings.salaryMinor)}</Text>
          </View>
        )}
      </View>

      {/* Week strip */}
      <Card>
        <CardHeader icon="calendar-outline" title="Bu Hafta" />
        <View style={styles.weekStrip}>
          {week.map((date) => {
            const dow = new Date(date.replace(/-/g, '/')).getDay();
            const day = days.find((d) => d.localDate === date);
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const dotColor =
              day?.status === 'WORKED' ? theme.success :
              day?.status === 'HOLIDAY' ? theme.warning :
              day?.status === 'LEAVE' ? theme.danger :
              theme.border;
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
                <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <View style={styles.dayHeader}>
            <View style={[styles.dayStatusIcon, { backgroundColor: { success: theme.successSurface, warning: theme.warningSurface, danger: theme.dangerSurface, muted: theme.surface }[statusInfo.tone] }]}>
              <Ionicons accessible={false} name={statusInfo.name} size={20} color={theme[statusInfo.tone]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dayStatus, { color: theme.foreground }]}>
                {STATUS_LABELS[selectedDay.status] ?? selectedDay.status}
              </Text>
              {selectedDay.leaveType && selectedDay.leaveType !== 'HOLIDAY' && (
                <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>
                  {selectedDay.leaveType}{selectedDay.leaveHalfDay ? ' (yarım gün)' : ''}
                </Text>
              )}
            </View>
          </View>
          {selectedDay.overtimeMinutes > 0 && (
            <View style={[styles.infoBadge, { backgroundColor: theme.warningSurface }]}>
              <Ionicons accessible={false} name="timer-outline" size={14} color={theme.warning} />
              <Text style={{ color: theme.warning, fontSize: layout.type.caption, fontWeight: '600' }}>
                Fazla mesai: {Math.floor(selectedDay.overtimeMinutes / 60)} sa {selectedDay.overtimeMinutes % 60} dk
              </Text>
            </View>
          )}
          {selectedDay.note && (
            <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>{selectedDay.note}</Text>
          )}
          <ActionButton
            label="Düzenle"
            variant="secondary"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/day-edit' as never, params: { date: selectedDate } })}
          />
        </Card>
      )}

      {/* Period stats */}
      <Card>
        <CardHeader icon="stats-chart-outline" title={periodInfo ? `Bu Dönem (${periodInfo.label})` : 'Bu Dönem'} />
        <View style={styles.statRow}>
          <StatTile value={periodStatement ? String(periodStatement.workedDays) : '—'} label="Çalışılan" tone="success" style={{ flex: 1 }} />
          <StatTile value={periodStatement && periodStatement.overtimeMinutes > 0 ? `${Math.floor(periodStatement.overtimeMinutes / 60)}sa` : '0'} label="Fazla mesai" tone="warning" style={{ flex: 1 }} />
          <StatTile value={periodStatement ? String(periodStatement.totalDays - periodStatement.workedDays) : '—'} label="İzin/Tatil" tone="danger" style={{ flex: 1 }} />
        </View>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader icon="add-circle-outline" title="Hızlı Erişim" />
        <ActionButton
          label="Ek gelir ekle"
          variant="secondary"
          icon="cash-outline"
          onPress={() => router.push('/additional-income' as never)}
        />
        <ActionButton
          label="Vardiya değişikliği"
          variant="secondary"
          icon="swap-horizontal-outline"
          onPress={() => router.push('/shift-change' as never)}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: layout.type.title, fontWeight: '900' },
  dateText: { fontSize: layout.type.caption, fontWeight: '600', marginTop: 2 },
  salaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: layout.radius.pill },
  salaryText: { fontSize: layout.type.caption, fontWeight: '800' },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: {
    alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: layout.radius.control, borderWidth: 1.5, minWidth: 40, gap: 4,
  },
  weekDayLabel: { fontSize: 11, fontWeight: '600' },
  weekDayNumber: { fontSize: layout.type.body, fontWeight: '700' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayStatusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayStatus: { fontSize: layout.type.body, fontWeight: '700' },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statRow: { flexDirection: 'row', gap: layout.space.md },
});
