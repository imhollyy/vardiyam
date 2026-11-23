import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { deriveDays, type DerivedDay, type MonthlyStatement, type Settings } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadCurrentPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { DayBlock, type DayBlockStatus } from '@/src/components/ui/DayBlock';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { SkeletonCard } from '@/src/components/ui/Skeleton';

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

const STATUS_LABEL: Record<string, string> = {
  WORKED: 'Çalışma günü',
  OFF: 'Planlı boş gün',
  LEAVE: 'İzin günü',
  HOLIDAY: 'Resmî tatil',
};

const STATUS_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  WORKED: 'checkmark-circle',
  HOLIDAY: 'flag',
  LEAVE: 'bed',
  OFF: 'moon',
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

  if (loading) {
    return (
      <Screen>
        <PageHeading eyebrow={formatGreeting()} title={formatDate(today)} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={4} />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Heading: greeting + date, salary pill */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageHeading eyebrow={formatGreeting()} title={formatDate(today)} />
        {settings && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: layout.radius.pill, marginTop: 6 }}>
            <Ionicons accessible={false} name="wallet" size={14} color={theme.muted} />
            <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.caption, color: theme.muted }}>
              {formatTryMinor(settings.salaryMinor)}
            </Text>
          </View>
        )}
      </View>

      {/* Period summary ink card */}
      <InkCard
        eyebrow={periodInfo?.label ?? 'Bu dönem'}
        amount={periodStatement ? formatTryMinor(periodStatement.netMinor) : '—'}
        daysLabel={periodStatement ? `${periodStatement.workedDays} gün` : undefined}
      >
        <InkCardRow>
          <InkCardStat label="Çalışılan" value={periodStatement ? String(periodStatement.workedDays) : '—'} />
          <InkCardStat label="Fazla mesai" value={periodStatement && periodStatement.overtimeMinutes > 0 ? `${Math.floor(periodStatement.overtimeMinutes / 60)} sa` : '0 sa'} />
          <InkCardStat label="İzin/Tatil" value={periodStatement ? String(periodStatement.totalDays - periodStatement.workedDays) : '—'} />
        </InkCardRow>
      </InkCard>

      {/* Week strip */}
      <SectionHeader title="Bu Hafta" />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {week.map((date) => {
          const dow = new Date(date.replace(/-/g, '/')).getDay();
          const day = days.find((d) => d.localDate === date);
          const dateNum = date.split('-')[2] ?? '';
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${DAY_LABELS[dow]} ${dateNum}`}
              accessibilityState={{ selected: date === selectedDate }}
              onPress={() => setSelectedDate(date)}
              style={{ flex: 1 }}
            >
              <DayBlock
                dayLabel={DAY_LABELS[dow] ?? ''}
                dateNumber={dateNum}
                code={toDayCode(day)}
                status={toDayBlockStatus(day)}
                isToday={date === today}
                hasOvertime={(day?.overtimeMinutes ?? 0) > 0}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons accessible={false} name={STATUS_ICON[selectedDay.status] ?? 'moon'} size={22} color={theme.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: layout.type.body, color: theme.ink }}>
                {STATUS_LABEL[selectedDay.status] ?? selectedDay.status}
              </Text>
              {selectedDay.leaveType && selectedDay.leaveType !== 'HOLIDAY' && (
                <Text style={{ fontFamily: fonts.medium, color: theme.muted, fontSize: layout.type.caption }}>
                  {selectedDay.leaveType}{selectedDay.leaveHalfDay ? ' (yarım gün)' : ''}
                </Text>
              )}
            </View>
            {selectedDay.overtimeMinutes > 0 && (
              <View style={{ backgroundColor: theme.warningSurface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: layout.radius.pill }}>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.warning }}>
                  +{Math.floor(selectedDay.overtimeMinutes / 60)} sa
                </Text>
              </View>
            )}
          </View>
          {selectedDay.note ? (
            <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption }}>{selectedDay.note}</Text>
          ) : null}
          <ActionButton
            label="Düzenle"
            variant="secondary"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/day-edit' as never, params: { date: selectedDate } })}
          />
        </Card>
      )}

      {/* Quick actions */}
      <SectionHeader title="Hızlı Erişim" />
      <Card>
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
