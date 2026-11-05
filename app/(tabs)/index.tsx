import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ShiftKindBadge } from '@/src/components/shifts/ShiftKindBadge';
import {
  getNominalShiftWindow,
  type PlannedShift,
  type ShiftCycle,
  type ShiftTemplate,
} from '@/src/domain/shift-cycle/index';
import { getPlannedShiftsForRange, listShiftCycles, listShiftTemplates } from '@/src/data/shiftCycleRepository';
import { addLocalDays, formatLocalDate, getLocalToday } from '@/src/features/shifts/dates';
import { colors } from '@/src/theme/tokens';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];

function Button({ label, onPress, theme, secondary = false }: { label: string; onPress: () => void; theme: Theme; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.surface : theme.accent, borderColor: secondary ? theme.border : theme.accent, opacity: pressed ? 0.74 : 1 }]}
    >
      <Text style={{ color: secondary ? theme.foreground : theme.surface, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function PlanCard({ plan, template, eyebrow, theme }: {
  plan: PlannedShift;
  template?: ShiftTemplate;
  eyebrow: string;
  theme: Theme;
}) {
  const window = plan.kind === 'SHIFT' && template
    ? getNominalShiftWindow(plan.localDate, template.startLocalTime, template.endLocalTime)
    : null;
  return (
    <View style={[styles.planCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.date, { color: theme.foreground }]}>{formatLocalDate(plan.localDate)}</Text>
      <ShiftKindBadge kind={plan.kind} template={template} />
      {window ? (
        <Text style={[styles.time, { color: theme.foreground }]}>
          {window.startLocalTime}–{window.endLocalTime}{window.crossesMidnight ? ' · ertesi gün biter' : ''}
        </Text>
      ) : null}
      {plan.source === 'OVERRIDE' ? <Text style={[styles.override, { color: theme.muted }]}>Bu gün tek seferlik değiştirildi.</Text> : null}
    </View>
  );
}

export default function TodayScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;
  const today = getLocalToday('Europe/Istanbul');
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plans, setPlans] = useState<PlannedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, savedTemplates] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
      ]);
      const active = cycles[0] ?? null;
      setCycle(active);
      setTemplates(savedTemplates);
      if (!active) {
        setPlans([]);
        return;
      }
      setPlans(await getPlannedShiftsForRange(database, active.id, today, addLocalDays(today, 30)));
    } catch {
      setError('Bugünün vardiya planı yüklenemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [database, today]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const planByDate = useMemo(() => new Map(plans.map((plan) => [plan.localDate, plan])), [plans]);
  const todayPlan = planByDate.get(today);
  const upcoming = plans.filter((plan) => plan.localDate > today && plan.kind === 'SHIFT').slice(0, 3);

  const templateFor = (plan: PlannedShift) => plan.kind === 'SHIFT'
    ? templates.find((template) => template.id === plan.templateId)
    : undefined;

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.eyebrow, { color: theme.accent }]}>VARDİYA PLANI</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>Bugün</Text>
      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.loading}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.muted }}>Planın yükleniyor…</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text accessibilityRole="alert" style={[styles.body, { color: theme.foreground }]}>{error}</Text>
          <Button label="Tekrar dene" onPress={() => void load()} theme={theme} />
        </View>
      ) : !cycle ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Vardiya planın hazır değil</Text>
          <Text style={[styles.body, { color: theme.muted }]}>Bir düzen oluşturduğunda bugünkü ve yaklaşan vardiyalar burada görünür.</Text>
          <Button label="Vardiya düzeni oluştur" onPress={() => router.push('/(tabs)/settings')} theme={theme} />
        </View>
      ) : todayPlan ? (
        <>
          <PlanCard plan={todayPlan} template={templateFor(todayPlan)} eyebrow="BUGÜNÜN PLANI" theme={theme} />
          <View style={[styles.upcomingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>Yaklaşan vardiyalar</Text>
              <Pressable accessibilityLabel="Takvim sekmesini aç" accessibilityRole="button" onPress={() => router.push('/(tabs)/calendar')} style={styles.textButton}>
                <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '800' }}>Takvime git</Text>
              </Pressable>
            </View>
            {upcoming.length ? upcoming.map((plan) => (
              <View key={plan.localDate} style={[styles.upcomingRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.upcomingDate, { color: theme.foreground }]}>{formatLocalDate(plan.localDate, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <View style={styles.upcomingDetail}>
                  <ShiftKindBadge compact kind="SHIFT" template={templateFor(plan)} />
                  {templateFor(plan) ? <Text style={[styles.upcomingTime, { color: theme.muted }]}>{templateFor(plan)?.startLocalTime}–{templateFor(plan)?.endLocalTime}</Text> : null}
                </View>
              </View>
            )) : (
              <Text style={[styles.body, { color: theme.muted }]}>Önümüzdeki 30 günde planlanmış başka vardiya yok.</Text>
            )}
          </View>
          <Text style={[styles.disclaimer, { color: theme.muted }]}>Bu yalnızca planlanan vardiyadır. Fiilî çalışma ve ücret hesabı içermez.</Text>
        </>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Bugünün planı bulunamadı</Text>
          <Text style={[styles.body, { color: theme.muted }]}>Takvim aralığı bugünü içermedi. Yeniden yüklemeyi deneyin.</Text>
          <Button label="Yeniden yükle" onPress={() => void load()} theme={theme} />
        </View>
      )}
      {cycle && todayPlan?.kind === 'SHIFT' ? (
        <Button
          label="Planlı vardiyadan kayıt ekle"
          onPress={() => router.push({ pathname: '/work-records', params: { action: 'planned', cycleId: cycle.id, localDate: today } })}
          theme={theme}
        />
      ) : null}
      <Button label="Plansız çalışma kaydı ekle" onPress={() => router.push({ pathname: '/work-records', params: { action: 'manual', localDate: today } })} theme={theme} secondary />
      <Button label="Çalışma geçmişi" onPress={() => router.push('/work-records')} theme={theme} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 32, gap: 16 },
  eyebrow: { marginTop: 8, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: -10, fontSize: 32, fontWeight: '800' },
  planCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14, marginTop: 12 },
  upcomingCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 22, lineHeight: 29, fontWeight: '800', textTransform: 'capitalize' },
  time: { fontSize: 20, fontWeight: '800' },
  override: { fontSize: 13, lineHeight: 19 },
  body: { fontSize: 15, lineHeight: 22 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  upcomingRow: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  upcomingDate: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  upcomingDetail: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  upcomingTime: { fontSize: 13, fontWeight: '600' },
  disclaimer: { fontSize: 12, lineHeight: 18 },
  loading: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
