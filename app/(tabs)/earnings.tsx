import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { type MonthlyStatement, getPayPeriodForDate } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';

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
        <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 100 }}>Yükleniyor…</Text>
      </Screen>
    );
  }

  const mainRows: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name']; color?: string; detail?: string }[] = [
    { label: 'Taban maaş', value: formatTryMinor(statement.baseSalaryMinor), icon: 'wallet-outline' },
    { label: 'Çalışılan gün', value: `${statement.workedDays} / ${statement.totalDays}`, icon: 'calendar-outline' },
    {
      label: 'Fazla mesai',
      value: formatTryMinor(statement.overtimeMinor),
      icon: 'timer-outline',
      color: statement.overtimeMinor > 0 ? theme.warning : undefined,
      detail: statement.overtimeMinutes > 0
        ? `Planlı: ${overtimeHours(statement.scheduledOvertimeMinutes)} · Elle: ${overtimeHours(statement.manualOvertimeMinutes)}`
        : undefined,
    },
    { label: 'Tatil primi', value: formatTryMinor(statement.holidayBonusMinor), icon: 'flag-outline' },
    { label: 'Ek gelirler', value: formatTryMinor(statement.extraIncomeMinor), icon: 'cash-outline', color: theme.success },
    { label: 'Kesintiler', value: `−${formatTryMinor(statement.deductionMinor)}`, icon: 'remove-circle-outline', color: theme.danger },
  ];

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
      <View style={styles.periodNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki dönem"
          onPress={() => navigatePeriod(-1)}
          style={[styles.navBtn, { backgroundColor: theme.surface }]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.foreground} />
        </Pressable>
        <Text style={[styles.periodLabel, { color: theme.foreground }]}>{period.label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki dönem"
          onPress={() => navigatePeriod(1)}
          style={[styles.navBtn, { backgroundColor: theme.surface }]}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.foreground} />
        </Pressable>
      </View>

      <PageHeading eyebrow="KAZANÇ" title={period.label} subtitle="Aylık tahmini kazanç dökümü" />

      {/* Net total */}
      <Card style={{ backgroundColor: theme.accentSurface, borderColor: theme.accent }}>
        <View style={styles.netRow}>
          <View>
            <Text style={{ color: theme.muted, fontSize: layout.type.caption, fontWeight: '600' }}>Tahmini Net</Text>
            <Text style={[styles.netValue, { color: theme.accent }]}>{formatTryMinor(statement.netMinor)}</Text>
          </View>
          <View style={[styles.netIcon, { backgroundColor: theme.accent }]}>
            <Ionicons name="trending-up" size={22} color={theme.onPrimaryAction} />
          </View>
        </View>
      </Card>

      {/* Main breakdown */}
      <Card>
        <CardHeader icon="list-outline" title="Gelir Kalemleri" />
        {mainRows.map((row) => (
          <View key={row.label}>
            <View style={[styles.row, { borderBottomColor: theme.border }]} accessibilityLabel={`${row.label}: ${row.value}`}>
              <View style={styles.rowLeft}>
                <Ionicons accessible={false} name={row.icon} size={16} color={row.color ?? theme.muted} />
                <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{row.label}</Text>
              </View>
              <Text style={{ color: row.color ?? theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>
                {row.value}
              </Text>
            </View>
            {row.detail && (
              <Text style={{ color: theme.muted, fontSize: layout.type.caption, paddingLeft: 24, paddingBottom: 6 }}>
                {row.detail}
              </Text>
            )}
          </View>
        ))}
      </Card>

      {/* Tax details - expandable */}
      <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)}>
        <Card>
          <View style={styles.expandHeader}>
            <CardHeader icon="document-text-outline" title="Vergi ve Kesinti Detayı" />
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
          </View>
          {expanded && taxRows.map((row) => (
            <View key={row.label} style={[styles.row, { borderBottomColor: theme.border }]} accessibilityLabel={`${row.label}: ${row.value}`}>
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{row.label}</Text>
              <Text style={{ color: theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>{row.value}</Text>
            </View>
          ))}
        </Card>
      </Pressable>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Ionicons accessible={false} name="information-circle-outline" size={14} color={theme.muted} />
        <Text style={[styles.disclaimerText, { color: theme.muted }]}>
          Tahmini hesaplamadır. Gerçek bordro değerlerinden farklılık gösterebilir.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  periodLabel: { fontSize: 15, fontWeight: '600' },
  navBtn: { padding: 8, borderRadius: 8 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netValue: { fontSize: 28, fontWeight: '900' },
  netIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  disclaimerText: { fontSize: layout.type.caption, flex: 1, lineHeight: 18 },
});
