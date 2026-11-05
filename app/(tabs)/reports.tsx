import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getReportsRewardState, saveReportsRewardState, type ReportsRewardState } from '@/src/data/appPreferencesRepository';
import { listApprovedEarningsSnapshots } from '@/src/data/earningsRepository';
import { getPeriodPaymentLedger, listPayrollPeriods, type PayrollPeriod } from '@/src/data/paymentRepository';
import { listWorkRecordsWithTimedBreaks } from '@/src/data/workRecordRepository';
import { listWorkDayStatuses } from '@/src/data/workSessionRepository';
import { getPlannedShiftsForRange, listShiftCycles, listShiftTemplates } from '@/src/data/shiftCycleRepository';
import { addLocalDays, formatLocalDate, formatMonthTitle, getLocalToday, monthForLocalDate, monthRange, mondayFirstWeekdayOffset, shiftYearMonth } from '@/src/features/shifts/dates';
import { canUseReportsReward, summarizeReports, type ReportRange } from '@/src/features/reports/reportSummary';
import { buildWorkTrend } from '@/src/features/reports/workTrend';
import { formatTryMinor } from '@/src/domain/payments';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { PageHeading } from '@/src/components/ui/PageHeading';

type Mode = 'day' | 'week' | 'month';
const ZONE = 'Europe/Istanbul';
const isPro = false;

function formatMinutes(minutes: number): string {
  const absolute = Math.abs(minutes), hours = Math.floor(absolute / 60), rest = absolute % 60;
  return `${minutes < 0 ? '−' : ''}${hours} sa ${String(rest).padStart(2, '0')} dk`;
}

export default function ReportsScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { theme } = useAppTheme();
  const today = getLocalToday(ZONE);
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(monthForLocalDate(today));
  const [reward, setReward] = useState<ReportsRewardState>({ expiresAtUtc: null, lastUsedLocalDate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof listWorkRecordsWithTimedBreaks>>>([]);
  const [statuses, setStatuses] = useState<Awaited<ReturnType<typeof listWorkDayStatuses>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof getPlannedShiftsForRange>>>([]);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listShiftTemplates>>>([]);
  const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof listApprovedEarningsSnapshots>>>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getPeriodPaymentLedger>> | null>(null);

  const nowUtc = new Date().toISOString();
  const range = useMemo<ReportRange>(() => {
    if (mode === 'day') return { start: today, endExclusive: addLocalDays(today, 1) };
    if (mode === 'week') {
      const start = addLocalDays(today, -mondayFirstWeekdayOffset(today));
      return { start, endExclusive: addLocalDays(start, 7) };
    }
    const current = monthRange(month);
    return { start: current.start, endExclusive: addLocalDays(current.end, 1) };
  }, [mode, month, today]);
  const unlocked = isPro || (reward.expiresAtUtc !== null && Date.parse(reward.expiresAtUtc) > Date.parse(nowUtc));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const nextReward = await getReportsRewardState(database);
      setReward(nextReward);
      if (!isPro && (!nextReward.expiresAtUtc || Date.parse(nextReward.expiresAtUtc) <= Date.now())) {
        setLoading(false);
        return;
      }
      const [savedRecords, savedStatuses, cycles, savedTemplates, savedSnapshots, savedPeriods] = await Promise.all([
        listWorkRecordsWithTimedBreaks(database),
        listWorkDayStatuses(database, range.start, range.endExclusive),
        listShiftCycles(database),
        listShiftTemplates(database),
        listApprovedEarningsSnapshots(database),
        listPayrollPeriods(database),
      ]);
      const cycle = cycles[0] ?? null;
      const savedPlans = cycle ? await getPlannedShiftsForRange(database, cycle.id, range.start, range.endExclusive) : [];
      setRecords(savedRecords); setStatuses(savedStatuses); setPlans(savedPlans); setTemplates(savedTemplates); setSnapshots(savedSnapshots); setPeriods(savedPeriods);
      const relevant = savedPeriods.find((period) => range.start >= period.startLocalDate && range.start < period.endExclusiveLocalDate) ?? savedPeriods[0] ?? null;
      setPeriodId(relevant?.id ?? null);
      setLedger(relevant ? await getPeriodPaymentLedger(database, relevant.id) : null);
    } catch {
      setError('Raporlar yüklenemedi. Yerel kayıtların korunuyor; tekrar deneyebilirsin.');
    } finally { setLoading(false); }
  }, [database, range]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const summary = useMemo(() => summarizeReports({ range, records, statuses, plans, templates, snapshots }), [range, records, statuses, plans, templates, snapshots]);
  const workTrend = useMemo(() => buildWorkTrend(records, range.start, range.endExclusive, mode), [records, range, mode]);
  const maxTrendMinutes = Math.max(1, ...workTrend.map((item) => item.workedMinutes));
  const selectedPeriodIndex = periods.findIndex((period) => period.id === periodId);
  const choosePeriod = async (offset: number) => {
    if (!periods.length || selectedPeriodIndex < 0) return;
    const nextIndex = (selectedPeriodIndex + offset + periods.length) % periods.length;
    const next = periods[nextIndex];
    setPeriodId(next.id);
    setLoading(true);
    try { setLedger(await getPeriodPaymentLedger(database, next.id)); setError(null); }
    catch { setError('Ödeme özeti yüklenemedi.'); }
    finally { setLoading(false); }
  };

  const grantPreview = () => {
    if (!__DEV__) {
      Alert.alert('Reklam henüz etkin değil', 'Ödüllü reklam bağlantısı hazır olduğunda bu seçenek kullanılabilir.');
      return;
    }
    if (!canUseReportsReward(reward, new Date().toISOString(), today)) {
      Alert.alert('Bugünkü kullanım tamamlandı', 'Ücretsiz önizleme hakkı günde bir kez kullanılabilir.');
      return;
    }
    Alert.alert('Önizleme erişimi', 'Gerçek reklam oynatılmayacak. Bu geliştirme önizlemesi raporları 24 saat açar.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Önizlemeyi aç', onPress: () => {
        const expiresAtUtc = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const next = { expiresAtUtc, lastUsedLocalDate: today };
        void saveReportsRewardState(database, next).then(() => { setReward(next); void load(); })
          .catch(() => setError('Önizleme durumu kaydedilemedi.'));
      } },
    ]);
  };

  if (!unlocked) return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}>
    <PageHeading eyebrow="ÖZETLERİN" title="Raporlar" />
    <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.lockIcon, { backgroundColor: theme.accentSurface }]}><Ionicons name="lock-closed-outline" size={26} color={theme.accent} /></View>
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.foreground }]}>Raporlar Pro özelliğidir</Text>
      <Text style={[styles.body, { color: theme.muted }]}>Çalışma özetleri, vardiya dağılımı, onaylı tahmini brüt kalemleri ve seçtiğin bordro döneminin net ödeme karşılaştırması burada görünür.</Text>
      {__DEV__ ? <Pressable accessibilityRole="button" onPress={grantPreview} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Ionicons name="play-circle-outline" size={18} color={theme.onPrimaryAction} /><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Ödüllü açma önizlemesi</Text></Pressable>
        : <Pressable accessibilityRole="button" onPress={grantPreview} style={[styles.primary, { backgroundColor: theme.primaryAction }]}><Text style={[styles.primaryText, { color: theme.onPrimaryAction }]}>Ücretsiz açma seçenekleri</Text></Pressable>}
      <Text style={[styles.caption, { color: theme.muted }]}>Gerçek reklam SDK’sı ve Pro satın alma bağlantısı bu sürümde etkin değildir. Önizleme akışı günde bir kez ve 24 saatlik yerel durumla sınırlıdır.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)')} style={styles.secondary}><Text style={{ color: theme.accent, fontWeight: '800' }}>Uygulamaya dön</Text></Pressable>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    </View>
  </ScrollView>;

  const modeLabels: { key: Mode; label: string }[] = [{ key: 'day', label: 'Günlük' }, { key: 'week', label: 'Haftalık' }, { key: 'month', label: 'Aylık' }];
  const reportLabel = mode === 'day' ? formatLocalDate(range.start) : mode === 'week' ? `${formatLocalDate(range.start, { day: 'numeric', month: 'short' })} – ${formatLocalDate(addLocalDays(range.endExclusive, -1), { day: 'numeric', month: 'short' })}` : formatMonthTitle(month);
  const maxShift = Math.max(1, ...summary.shiftDistribution.map((item) => item.minutes));
  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}>
    <PageHeading eyebrow="ÇALIŞMA ÖZETİ" title="Raporlar" subtitle="Kayıtlı çalışma ve onaylı hesaplardan derlenir; yasal veya bordro sonucu değildir." />
    <View style={styles.modeRow}>{modeLabels.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: mode === item.key }} onPress={() => setMode(item.key)} style={[styles.modeChip, { backgroundColor: mode === item.key ? theme.primaryAction : theme.surface, borderColor: mode === item.key ? theme.primaryAction : theme.border }]}><Text style={{ color: mode === item.key ? theme.onPrimaryAction : theme.foreground, fontWeight: '800' }}>{item.label}</Text></Pressable>)}</View>
    <View style={styles.monthRow}>{mode === 'month' ? <Pressable accessibilityLabel="Önceki ay" accessibilityRole="button" onPress={() => setMonth((value) => shiftYearMonth(value, -1))} style={[styles.arrow, { borderColor: theme.border, backgroundColor: theme.surface }]}><Ionicons name="chevron-back" size={18} color={theme.foreground} /></Pressable> : null}<Text accessibilityLiveRegion="polite" style={[styles.periodTitle, { color: theme.foreground }]}>{reportLabel}</Text>{mode === 'month' ? <Pressable accessibilityLabel="Sonraki ay" accessibilityRole="button" onPress={() => setMonth((value) => shiftYearMonth(value, 1))} style={[styles.arrow, { borderColor: theme.border, backgroundColor: theme.surface }]}><Ionicons name="chevron-forward" size={18} color={theme.foreground} /></Pressable> : null}</View>
    {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Rapor hazırlanıyor…</Text></View> : error ? <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={{ color: theme.accent, fontWeight: '800' }}>Tekrar dene</Text></Pressable></View> : <>
      <View style={styles.statGrid}><StatCard icon="time-outline" label="Kaydedilen çalışma" value={formatMinutes(summary.workedMinutes)} theme={theme} /><StatCard icon="checkmark-done-outline" label="Çalışma günü" value={`${summary.completedDays} gün`} theme={theme} /><StatCard icon="trending-up-outline" label="Fazla çalışma kalemleri" value={formatMinutes(summary.overtimeMinutes)} theme={theme} /><StatCard icon="add-circle-outline" label="Fazla süre kalemleri" value={formatMinutes(summary.extraHoursMinutes)} theme={theme} /></View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Fiilî çalışma eğilimi</Text><Text style={[styles.caption, { color: theme.muted }]}>Mevcut segmentasyon motoru · yerel güne göre · toplam mola saati bilinmiyorsa kesin süre gösterilmez.</Text>{workTrend.map((item) => <View key={item.label} style={styles.barRow}><Text style={[styles.barLabel, { color: theme.foreground }]}>{item.label}</Text><View style={[styles.barTrack, { backgroundColor: theme.background }]}><View style={[styles.bar, { width: `${item.workedMinutes ? Math.max(3, item.workedMinutes / maxTrendMinutes * 100) : 0}%`, backgroundColor: theme.accent }]} /></View><View style={{ minWidth: 80, alignItems: 'flex-end' }}><Text accessibilityLabel={`${item.label}: ${item.uncertainRecords ? `en az ${formatMinutes(item.workedMinutes)}, ${item.uncertainRecords} belirsiz segment` : formatMinutes(item.workedMinutes)}`} style={[styles.caption, { color: theme.muted, textAlign: 'right' }]}>{item.uncertainRecords ? item.workedMinutes ? `En az ${formatMinutes(item.workedMinutes)}` : 'Belirsiz' : formatMinutes(item.workedMinutes)}</Text>{item.uncertainRecords ? <Text style={[styles.caption, { color: theme.warning }]}>+ belirsiz süre</Text> : null}</View></View>)}</View>
      {summary.unallocatedBreakMinutes > 0 ? <Text style={[styles.caption, { color: theme.muted }]}>Kaydedilen çalışma süresinden yalnız saati bilinen molalar düşülür. {formatMinutes(summary.unallocatedBreakMinutes)} mola süresinin saati belirtilmediği için dönem günlerine dağıtılamadı.</Text> : null}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Planlanan süre farkı</Text><Text style={[styles.value, { color: summary.durationDifferenceMinutes >= 0 ? theme.success : theme.danger }]}>{summary.durationDifferenceMinutes > 0 ? '+' : ''}{formatMinutes(summary.durationDifferenceMinutes)}</Text><Text style={[styles.caption, { color: theme.muted }]}>Fiilî giriş-çıkış aralığı ile planlanan şablon aralığının farkıdır. Mola düşümü veya mesai sınıflandırması değildir.</Text></View>
      <View style={styles.statusRow}>{[["İzin", summary.leaveDays, 'bed-outline'], ["Rapor", summary.reportDays, 'medkit-outline'], ["Gidilmedi", summary.absentDays, 'close-circle-outline']].map(([label, count, icon]) => <View key={String(label)} style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name={String(icon) as React.ComponentProps<typeof Ionicons>['name']} size={18} color={theme.warning} /><Text style={{ color: theme.foreground, fontWeight: '800' }}>{String(count)} gün</Text><Text style={{ color: theme.muted, fontSize: 11 }}>{label}</Text></View>)}</View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Vardiya dağılımı</Text>{summary.shiftDistribution.length ? summary.shiftDistribution.map((item) => <View key={item.name} style={styles.barRow}><Text numberOfLines={1} style={[styles.barLabel, { color: theme.foreground }]}>{item.name}</Text><View style={[styles.barTrack, { backgroundColor: theme.background }]}><View style={[styles.bar, { width: `${Math.max(5, item.minutes / maxShift * 100)}%`, backgroundColor: theme.accent }]} /></View><Text style={[styles.caption, { color: theme.muted }]}>{formatMinutes(item.minutes)}</Text></View>) : <Text style={[styles.body, { color: theme.muted }]}>Bu aralıkta planlı vardiya bulunmuyor.</Text>}</View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Onaylı tahmini brüt kalemler</Text>{summary.approvedSnapshotCount ? <><Text style={[styles.value, { color: theme.foreground }]}>{formatTryMinor(summary.approvedGrossMinor)}</Text><Text style={[styles.caption, { color: theme.muted }]}>{summary.approvedSnapshotCount} onaylı hesap · yalnız kaydedilmiş snapshot satırları</Text></> : <Text style={[styles.body, { color: theme.muted }]}>Bu aralıkta onaylı tahmini brüt hesabı yok. Brüt tahmin, bordro neti ve alınan ödeme ayrı tutulur.</Text>}</View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.monthRow}><Text style={[styles.cardTitle, { color: theme.foreground, flex: 1 }]}>Bordro neti ve alınan ödeme</Text>{periods.length ? <View style={styles.periodArrows}><Pressable accessibilityLabel="Önceki bordro dönemi" accessibilityRole="button" onPress={() => void choosePeriod(-1)}><Ionicons name="chevron-back" size={20} color={theme.accent} /></Pressable><Pressable accessibilityLabel="Sonraki bordro dönemi" accessibilityRole="button" onPress={() => void choosePeriod(1)}><Ionicons name="chevron-forward" size={20} color={theme.accent} /></Pressable></View> : null}</View>
        {ledger && periodId ? <><Text style={[styles.caption, { color: theme.muted }]}>{periods.find((item) => item.id === periodId)?.startLocalDate} – {addLocalDays(periods.find((item) => item.id === periodId)!.endExclusiveLocalDate, -1)}</Text><ReportMoney label="Bordro neti" value={ledger.reconciliation.payslipNetMinor === null ? 'Bilinmiyor' : formatTryMinor(ledger.reconciliation.payslipNetMinor)} theme={theme} /><ReportMoney label="Döneme dağıtılan net ödeme" value={formatTryMinor(ledger.reconciliation.allocatedPaymentMinor)} theme={theme} /><ReportMoney label="Bordroya göre kayıtlı ödeme farkı" value={ledger.reconciliation.differenceMinor === null ? 'Bilinmiyor' : formatTryMinor(ledger.reconciliation.differenceMinor)} theme={theme} /><ReportMoney label="Atanmamış ödeme bakiyesi" value={formatTryMinor(ledger.reconciliation.unallocatedPaymentMinor)} theme={theme} /></> : <Text style={[styles.body, { color: theme.muted }]}>Henüz kayıtlı bordro dönemi yok. Ödemeler otomatik olarak tarihten döneme bağlanmaz.</Text>}
      </View>
    </>}
  </ScrollView>;
}

function StatCard({ icon, label, value, theme }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name={icon} size={18} color={theme.accent} /><Text style={[styles.caption, { color: theme.muted }]}>{label}</Text><Text style={[styles.statValue, { color: theme.foreground }]}>{value}</Text></View>;
}
function ReportMoney({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <View style={[styles.moneyRow, { borderColor: theme.border }]}><Text style={[styles.caption, { color: theme.muted, flex: 1 }]}>{label}</Text><Text style={{ color: theme.foreground, fontWeight: '800' }}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 18, paddingTop: 26, paddingBottom: 32, gap: 14 }, heading: { gap: 5 }, eyebrow: { fontSize: 11, letterSpacing: 1.3, fontWeight: '900' }, title: { fontSize: 30, fontWeight: '900' }, body: { fontSize: 14, lineHeight: 21 }, caption: { fontSize: 12, lineHeight: 18 },
  lockCard: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 15 }, lockIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }, cardTitle: { fontSize: 16, fontWeight: '900' }, primary: { minHeight: 50, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 }, secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: 8 }, modeChip: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, periodTitle: { flex: 1, fontSize: 14, fontWeight: '800', textAlign: 'center', textTransform: 'capitalize' }, arrow: { width: 40, height: 40, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, periodArrows: { flexDirection: 'row', gap: 12 }, loading: { minHeight: 150, justifyContent: 'center', alignItems: 'center', gap: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, statCard: { width: '48%', flexGrow: 1, minHeight: 102, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 }, statValue: { fontSize: 17, fontWeight: '900' }, value: { fontSize: 23, fontWeight: '900' }, statusRow: { flexDirection: 'row', gap: 8 }, statusCard: { flex: 1, minHeight: 80, borderWidth: 1, borderRadius: 15, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, barLabel: { width: 75, fontSize: 12, fontWeight: '700' }, barTrack: { flex: 1, height: 8, borderRadius: 6, overflow: 'hidden' }, bar: { height: '100%', borderRadius: 6 }, moneyRow: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
