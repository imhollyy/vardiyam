import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { getAllExtraIncomes } from '@/src/data/extraIncomeRepository';
import { generateMonthlyStatement, type MonthlyStatement } from '@/src/domain/payroll/index';
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const settings = await getSettings(database);
        const entries = await getDayEntriesInRange(database, `${year}-01-01`, `${year}-12-31`);
        const extras = await getAllExtraIncomes(database);
        const currentMonth = new Date().getMonth() + 1;
        const stmts: MonthlyStatement[] = [];
        let cumulativeTaxable = 0;
        for (let m = 1; m <= currentMonth; m++) {
          const stmt = generateMonthlyStatement(settings, entries, extras, year, m, cumulativeTaxable);
          stmts.push(stmt);
          cumulativeTaxable += stmt.grossMinor - stmt.sgkWorkerMinor - stmt.unemploymentWorkerMinor;
        }
        if (active) setStatements(stmts);
      })();
      return () => { active = false; };
    }, [database, year]),
  );

  const totalNet = statements.reduce((s, st) => s + st.netMinor, 0);
  const totalGross = statements.reduce((s, st) => s + st.grossMinor, 0);
  const totalOvertime = statements.reduce((s, st) => s + st.overtimeMinor, 0);
  const totalWorkedDays = statements.reduce((s, st) => s + st.workedDays, 0);
  const maxNet = Math.max(...statements.map((s) => s.netMinor), 1);

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
          return (
            <View key={i} style={styles.monthRow} accessibilityLabel={`${MONTH_NAMES[i]}: ${formatTryMinor(stmt.netMinor)}`}>
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
