import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { getDayEntriesInRange } from '@/src/data/dayEntryRepository';
import { getAllExtraIncomes } from '@/src/data/extraIncomeRepository';
import { generateMonthlyStatement, type MonthlyStatement } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

function currentYearMonth(): [number, number] {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1];
}

export default function EarningsScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const [year, month] = useMemo(currentYearMonth, []);
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const settings = await getSettings(database);
        const entries = await getDayEntriesInRange(database, `${year}-01-01`, `${year}-12-31`);
        const extras = await getAllExtraIncomes(database);
        const stmt = generateMonthlyStatement(settings, entries, extras, year, month);
        if (active) setStatement(stmt);
      })();
      return () => { active = false; };
    }, [database, year, month]),
  );

  if (!statement) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 100 }}>Yükleniyor…</Text>
      </View>
    );
  }

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Taban maaş', value: formatTryMinor(statement.baseSalaryMinor) },
    { label: 'Çalışılan gün', value: `${statement.workedDays} / ${statement.totalDays}` },
    { label: 'Fazla mesai', value: formatTryMinor(statement.overtimeMinor), color: theme.warning },
    { label: 'Tatil primi', value: formatTryMinor(statement.holidayBonusMinor) },
    { label: 'Hafta sonu primi', value: formatTryMinor(statement.weekendBonusMinor) },
    { label: 'Ek gelirler', value: formatTryMinor(statement.extraIncomeMinor), color: theme.success },
    { label: 'Kesintiler', value: `−${formatTryMinor(statement.deductionMinor)}`, color: theme.danger },
    { label: 'Brüt', value: formatTryMinor(statement.grossMinor) },
    { label: 'SGK işçi payı', value: `−${formatTryMinor(statement.sgkWorkerMinor)}` },
    { label: 'İşsizlik sigortası', value: `−${formatTryMinor(statement.unemploymentWorkerMinor)}` },
    { label: 'Gelir vergisi', value: `−${formatTryMinor(statement.incomeTaxMinor)}` },
    { label: 'Damga vergisi', value: `−${formatTryMinor(statement.stampTaxMinor)}` },
    ...(statement.besDeductionMinor > 0 ? [{ label: 'BES kesintisi', value: `−${formatTryMinor(statement.besDeductionMinor)}` }] : []),
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.foreground }]}>Aylık Kazanç Dökümü</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((row) => (
          <View key={row.label} style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{row.label}</Text>
            <Text style={{ color: row.color ?? theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>
              {row.value}
            </Text>
          </View>
        ))}
        <View style={[styles.totalRow, { backgroundColor: theme.accentSurface, borderColor: theme.accent }]}>
          <Text style={{ color: theme.accent, fontSize: layout.type.section, fontWeight: '800' }}>Net</Text>
          <Text style={{ color: theme.accent, fontSize: layout.type.section, fontWeight: '800' }}>
            {formatTryMinor(statement.netMinor)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { fontSize: layout.type.title, fontWeight: '800', paddingHorizontal: layout.screen.horizontal, marginBottom: 16 },
  list: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: layout.radius.card, borderWidth: 1.5, marginTop: 16 },
});
