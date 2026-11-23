import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { type MonthlyStatement, getPayPeriod } from '@/src/domain/payroll/index';
import { loadPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { formatTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { StatTile } from '@/src/components/ui/StatTile';
import { PageHeading } from '@/src/components/ui/PageHeading';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function ReportsScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const year = useMemo(() => new Date().getFullYear(), []);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const settings = await getSettings(database);
          const currentMonth = new Date().getMonth() + 1;
          const stmts: MonthlyStatement[] = [];
          const pds: PeriodInfo[] = [];
          let cumulativeTaxable = 0;
          for (let m = 1; m <= currentMonth; m++) {
            const { start, end } = getPayPeriod(year, m, settings.payday);
            const period: PeriodInfo = { start, end, label: `${MONTH_NAMES[m - 1]!} ${year}` };
            const stmt = await loadPeriodStatement(database, period, cumulativeTaxable);
            stmts.push(stmt);
            pds.push(period);
            cumulativeTaxable += stmt.grossMinor - stmt.sgkWorkerMinor - stmt.unemploymentWorkerMinor;
          }
          if (active) { setStatements(stmts); setPeriods(pds); }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, year]),
  );

  const totalNet = statements.reduce((s, st) => s + st.netMinor, 0);
  const totalGross = statements.reduce((s, st) => s + st.grossMinor, 0);
  const totalOvertime = statements.reduce((s, st) => s + st.overtimeMinor, 0);
  const totalWorkedDays = statements.reduce((s, st) => s + st.workedDays, 0);
  const maxNet = Math.max(...statements.map((s) => s.netMinor), 1);

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
      <PageHeading eyebrow="RAPORLAR" title={`${year} Yılı`} subtitle="Yıllık gelir ve çalışma özeti" />

      <Card style={{ backgroundColor: theme.accentSurface, borderColor: theme.accent }}>
        <View style={styles.summaryRow}>
          <StatTile value={formatTryMinor(totalGross)} label="Toplam brüt" tone="muted" style={{ flex: 1 }} />
          <StatTile value={formatTryMinor(totalNet)} label="Toplam net" tone="accent" style={{ flex: 1 }} />
        </View>
        <View style={styles.summaryRow}>
          <StatTile value={String(totalWorkedDays)} label="Çalışılan gün" tone="success" style={{ flex: 1 }} />
          <StatTile value={formatTryMinor(totalOvertime)} label="Fazla mesai" tone="warning" style={{ flex: 1 }} />
        </View>
      </Card>

      <Card>
        <CardHeader icon="bar-chart-outline" title="Aylık Dağılım" />
        {statements.map((stmt, i) => {
          const barWidth = Math.max(8, (stmt.netMinor / maxNet) * 100);
          const periodLabel = periods[i]?.label ?? MONTH_NAMES[i] ?? '';
          return (
            <View key={i} style={styles.monthRow} accessibilityLabel={`${periodLabel}: ${formatTryMinor(stmt.netMinor)}`}>
              <Text style={[styles.monthLabel, { color: theme.foreground }]}>{MONTH_NAMES[i]?.slice(0, 3)}</Text>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { width: `${barWidth}%`, backgroundColor: theme.accent }]} />
              </View>
              <View style={styles.monthValues}>
                <Text style={[styles.monthNet, { color: theme.foreground }]}>{formatTryMinor(stmt.netMinor)}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{stmt.workedDays} gün</Text>
              </View>
            </View>
          );
        })}
      </Card>

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
  summaryRow: { flexDirection: 'row', gap: layout.space.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  monthLabel: { width: 32, fontSize: layout.type.caption, fontWeight: '700' },
  barContainer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.1)' },
  bar: { height: 8, borderRadius: 4 },
  monthValues: { alignItems: 'flex-end', minWidth: 80 },
  monthNet: { fontSize: layout.type.caption, fontWeight: '700' },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  disclaimerText: { fontSize: layout.type.caption, flex: 1, lineHeight: 18 },
});
