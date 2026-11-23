import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { type MonthlyStatement, getPayPeriodForDate } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { ListRow } from '@/src/components/ui/ListRow';
import { SectionHeader } from '@/src/components/ui/SectionHeader';

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function overtimeHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

export default function EarningsScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const settings = await getSettings(database);
        const today = todayLocal();
        const currentPeriod = getPayPeriodForDate(today, settings.payday);
        const stmt = await loadPeriodStatement(database, currentPeriod);
        if (active) {
          setPeriod(currentPeriod);
          setStatement(stmt);
        }
      })();
      return () => { active = false; };
    }, [database]),
  );

  const navigatePeriod = useCallback((direction: -1 | 1) => {
    if (!period) return;
    void (async () => {
      const settings = await getSettings(database);
      const [ey, em, ed] = period.end.split('-').map(Number) as [number, number, number];
      let newMonth = em + direction;
      let newYear = ey;
      if (newMonth < 1) { newMonth = 12; newYear--; }
      if (newMonth > 12) { newMonth = 1; newYear++; }
      const pad = (n: number) => String(n).padStart(2, '0');
      const probeDate = `${newYear}-${pad(newMonth)}-${pad(ed)}`;
      const newPeriod = getPayPeriodForDate(probeDate, settings.payday);
      const stmt = await loadPeriodStatement(database, newPeriod);
      setPeriod(newPeriod);
      setStatement(stmt);
    })();
  }, [database, period]);

  if (!statement || !period) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Screen>
    );
  }

  const taxRows: { label: string; value: string }[] = [
    { label: 'Brüt', value: formatTryMinor(statement.grossMinor) },
    { label: 'SGK işçi payı', value: `−${formatTryMinor(statement.sgkWorkerMinor)}` },
    { label: 'İşsizlik sigortası', value: `−${formatTryMinor(statement.unemploymentWorkerMinor)}` },
    { label: 'Gelir vergisi', value: `−${formatTryMinor(statement.incomeTaxMinor)}` },
    { label: 'Damga vergisi', value: `−${formatTryMinor(statement.stampTaxMinor)}` },
    ...(statement.besDeductionMinor > 0 ? [{ label: 'BES kesintisi', value: `−${formatTryMinor(statement.besDeductionMinor)}` }] : []),
  ];

  return (
    <Screen>
      {/* Period navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki dönem"
          onPress={() => navigatePeriod(-1)}
          style={{ width: 36, height: 36, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={18} color={theme.ink} />
        </Pressable>
        <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted }}>{period.label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki dönem"
          onPress={() => navigatePeriod(1)}
          style={{ width: 36, height: 36, borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.ink} />
        </Pressable>
      </View>

      <PageHeading eyebrow="KAZANÇ" title={period.label} subtitle="Aylık tahmini kazanç dökümü" />

      {/* Net total ink card */}
      <InkCard
        eyebrow="Tahmini Net"
        amount={formatTryMinor(statement.netMinor)}
        daysLabel={`${statement.workedDays} / ${statement.totalDays} gün`}
      >
        <InkCardRow>
          <InkCardStat label="Brüt" value={formatTryMinor(statement.grossMinor)} />
          <InkCardStat label="Fazla mesai" value={formatTryMinor(statement.overtimeMinor)} />
        </InkCardRow>
      </InkCard>

      {/* Main breakdown */}
      <SectionHeader title="Gelir Kalemleri" />
      <Card>
        <ListRow
          icon="wallet-outline"
          label="Taban maaş"
          value={formatTryMinor(statement.baseSalaryMinor)}
        />
        <ListRow
          icon="calendar-outline"
          label="Çalışılan gün"
          value={`${statement.workedDays} / ${statement.totalDays}`}
        />
        <View>
          <ListRow
            icon="timer-outline"
            label="Fazla mesai"
            value={formatTryMinor(statement.overtimeMinor)}
          />
          {statement.overtimeMinutes > 0 && (
            <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption, paddingLeft: 44, paddingBottom: 6 }}>
              {`Planlı: ${overtimeHours(statement.scheduledOvertimeMinutes)} · Elle: ${overtimeHours(statement.manualOvertimeMinutes)}`}
            </Text>
          )}
        </View>
        <ListRow
          icon="flag-outline"
          label="Tatil primi"
          value={formatTryMinor(statement.holidayBonusMinor)}
        />
        <ListRow
          icon="cash-outline"
          label="Ek gelirler"
          value={formatTryMinor(statement.extraIncomeMinor)}
        />
        <ListRow
          icon="remove-circle-outline"
          label="Kesintiler"
          value={`−${formatTryMinor(statement.deductionMinor)}`}
        />
      </Card>

      {/* Tax details - expandable */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Vergi detayını kapat' : 'Vergi detayını aç'}
        onPress={() => setExpanded((v) => !v)}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardHeader icon="document-text-outline" title="Vergi ve Kesinti Detayı" />
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
          </View>
          {expanded && taxRows.map((row) => (
            <View
              key={row.label}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}
              accessibilityLabel={`${row.label}: ${row.value}`}
            >
              <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.body }}>{row.label}</Text>
              <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{row.value}</Text>
            </View>
          ))}
        </Card>
      </Pressable>

      {/* Disclaimer */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 }}>
        <Ionicons accessible={false} name="information-circle-outline" size={14} color={theme.muted} />
        <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption, flex: 1, lineHeight: 18 }}>
          Tahmini hesaplamadır. Gerçek bordro değerlerinden farklılık gösterebilir.
        </Text>
      </View>
    </Screen>
  );
}
