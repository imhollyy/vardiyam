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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.foreground }]}>{year} Raporu</Text>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.summaryCard, { backgroundColor: theme.accentSurface, borderColor: theme.accent }]}>
          <View>
            <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>Toplam brüt</Text>
            <Text style={{ color: theme.foreground, fontSize: layout.type.section, fontWeight: '700' }}>{formatTryMinor(totalGross)}</Text>
          </View>
          <View>
            <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>Toplam net</Text>
            <Text style={{ color: theme.accent, fontSize: layout.type.section, fontWeight: '800' }}>{formatTryMinor(totalNet)}</Text>
          </View>
        </View>

        {statements.map((stmt, i) => (
          <View key={i} style={[styles.monthRow, { borderBottomColor: theme.border }]}>
            <Text style={{ color: theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>{MONTH_NAMES[i]}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.foreground, fontSize: layout.type.body, fontWeight: '700' }}>{formatTryMinor(stmt.netMinor)}</Text>
              <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>{stmt.workedDays} gün</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { fontSize: layout.type.title, fontWeight: '800', paddingHorizontal: layout.screen.horizontal, marginBottom: 16 },
  list: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, gap: 4 },
  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: layout.radius.card, borderWidth: 1.5, marginBottom: 12 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
