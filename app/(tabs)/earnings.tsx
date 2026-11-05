import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';

import { calculateGrossEarnings, type EarningsCalculationResult, type EarningsRule } from '@/src/domain/earnings';
import { getLocalDateTimeCandidates } from '@/src/domain/work-record';
import { addCalendarDays, dayOrdinal, type LocalDate } from '@/src/domain/shift-cycle';
import { listWorkRecordsWithTimedBreaksInRange } from '@/src/data/workRecordRepository';
import { getLatestEarningsProfile, listApprovedEarningsSnapshots, saveApprovedEarningsSnapshot, type EarningsProfileVersion } from '@/src/data/earningsRepository';
import { getOrCreatePayrollPeriod, getPeriodPaymentLedger } from '@/src/data/paymentRepository';
import { isEarningsSettings, makeCalculationInput, type EarningsSettings } from '@/src/features/earnings/profile';
import { canApproveEarnings, shouldShowGrossEstimate } from '@/src/features/earnings/presentation';
import { formatLocalDate, getLocalToday, shiftYearMonth } from '@/src/features/shifts/dates';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { payrollPeriodForMonth } from '@/src/features/payments/period';

function startOfWeek(date: LocalDate, weekStartsOn: number): LocalDate {
  const ordinal = dayOrdinal(date);
  const day = new Date(ordinal * 86_400_000).getUTCDay();
  const offset = (day - weekStartsOn + 7) % 7;
  return addCalendarDays(date, -offset);
}

function toUtcMidnight(localDate: LocalDate, timezone: string): string {
  const candidates = getLocalDateTimeCandidates(`${localDate}T00:00`, timezone);
  if (!candidates.length) throw new Error(`Yerel gün başlangıcı çözümlenemedi: ${localDate}`);
  return candidates[0];
}

function money(minor: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(minor / 100);
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

type PreviewInput = ReturnType<typeof makeCalculationInput> & { sourceRangeStartUtc: string; sourceRangeEndUtc: string };
type Preview = { input: PreviewInput; result: EarningsCalculationResult; periodStart: LocalDate; periodEnd: LocalDate; version: EarningsProfileVersion<EarningsSettings, EarningsRule[]> };

export default function EarningsScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [periodMonth, setPeriodMonth] = useState(() => getLocalToday('Europe/Istanbul').slice(0, 7));
  const [version, setVersion] = useState<EarningsProfileVersion<EarningsSettings, EarningsRule[]> | null>(null);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof listWorkRecordsWithTimedBreaksInRange>>>([]);
  const [weekChoices, setWeekChoices] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listApprovedEarningsSnapshots>>>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLedger, setPaymentLedger] = useState<Awaited<ReturnType<typeof getPeriodPaymentLedger>> | null>(null);

  const period = useMemo(() => {
    const day = version?.profile.payrollPeriodStartDay ?? 1;
    const identity = payrollPeriodForMonth(periodMonth, day, version?.profile.timezone ?? 'Europe/Istanbul');
    const start = identity.startLocalDate as LocalDate;
    const end = identity.endExclusiveLocalDate as LocalDate;
    return { start, end };
  }, [periodMonth, version]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null); setPreview(null);
    try {
      const current = await getLatestEarningsProfile<EarningsSettings, EarningsRule[]>(database);
      const paymentPeriod = payrollPeriodForMonth(periodMonth, current?.profile && isEarningsSettings(current.profile) ? current.profile.payrollPeriodStartDay : 1,
        current?.profile && isEarningsSettings(current.profile) ? current.profile.timezone : 'Europe/Istanbul');
      const persistedPeriod = await getOrCreatePayrollPeriod(database, paymentPeriod);
      setPaymentLedger(await getPeriodPaymentLedger(database, persistedPeriod.id));
      if (!current || !isEarningsSettings(current.profile)) {
        setVersion(null); setRecords([]); setWeekChoices([]); setHistory(await listApprovedEarningsSnapshots(database));
        return;
      }
      setVersion(current);
      const periodStartDay = current.profile.payrollPeriodStartDay;
      const identity = payrollPeriodForMonth(periodMonth, periodStartDay, current.profile.timezone);
      const start = identity.startLocalDate as LocalDate;
      const end = identity.endExclusiveLocalDate as LocalDate;
      const firstWeek = startOfWeek(start, current.profile.weekStartsOn);
      const lastWeek = startOfWeek(addCalendarDays(end, -1), current.profile.weekStartsOn);
      const queryStart = firstWeek;
      const queryEnd = addCalendarDays(lastWeek, 7);
      const candidates: string[] = [];
      for (let cursor = firstWeek; dayOrdinal(cursor) <= dayOrdinal(lastWeek); cursor = addCalendarDays(cursor, 7)) candidates.push(cursor);
      const rangeStart = toUtcMidnight(queryStart, current.profile.timezone);
      const rangeEnd = toUtcMidnight(queryEnd, current.profile.timezone);
      const [stored, saved] = await Promise.all([
        listWorkRecordsWithTimedBreaksInRange(database, rangeEnd, rangeStart),
        listApprovedEarningsSnapshots(database),
      ]);
      setRecords(stored); setHistory(saved); setWeekChoices(candidates); setPreview(null);
    } catch (cause) {
      setVersion(null); setRecords([]); setWeekChoices([]); setHistory([]);
      setError(cause instanceof Error ? cause.message : 'Kazanç verileri yüklenemedi.');
    } finally { setLoading(false); }
  }, [database, periodMonth]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const calculate = async () => {
    if (!version) return;
    setCalculating(true);
    try {
      const settings = version.profile;
      const identity = payrollPeriodForMonth(periodMonth, settings.payrollPeriodStartDay, settings.timezone);
      const periodStart = identity.startLocalDate as LocalDate;
      const periodEnd = identity.endExclusiveLocalDate as LocalDate;
      const now = new Date();
      const id = `preview-${now.getTime()}`;
      now.setUTCSeconds(0, 0);
      const input = makeCalculationInput({ settings, rules: version.rules, ruleVersionId: version.ruleVersionId,
        records: records.map(({ record, timedBreaks }) => ({ id: record.id, startedAtUtc: record.startedAtUtc, endedAtUtc: record.endedAtUtc,
          timezone: record.timezone, breakMinutes: record.breakMinutes, timedBreakIntervals: timedBreaks.map(({ startedAtUtc, endedAtUtc }) => ({ startedAtUtc, endedAtUtc })) })),
        completeWeekStarts: weekChoices.filter((week) => weekChoicesChecked.includes(week)), calculationId: id,
        calculatedAtUtc: now.toISOString() });
      const sourceRangeStartUtc = toUtcMidnight(weekChoices[0], settings.timezone);
      const sourceRangeEndUtc = toUtcMidnight(addCalendarDays(weekChoices.at(-1)!, 7), settings.timezone);
      const selectedPeriodStartUtc = toUtcMidnight(periodStart, settings.timezone);
      const payEffectiveInput = Date.parse(settings.payEffectiveFromUtc) > Date.parse(selectedPeriodStartUtc)
        ? { ...input, unresolvedPolicyReasons: [...(input.unresolvedPolicyReasons ?? []), 'Seçili bordro dönemi ücret profilinin geçerlilik başlangıcından önce başlıyor; dönem bazı doğrulanmadı.'] }
        : input;
      // The UI requires the user to attest to every local week included in this preview.
      const checked = weekChoices.every((week) => weekChoicesChecked.includes(week));
      const result = calculateGrossEarnings({ ...payEffectiveInput, completeWeekStarts: checked ? weekChoices : [] });
      setPreview({ input: { ...payEffectiveInput, completeWeekStarts: checked ? weekChoices : [], sourceRangeStartUtc, sourceRangeEndUtc }, result, periodStart, periodEnd, version });
    } catch (cause) {
      Alert.alert('Önizleme oluşturulamadı', cause instanceof Error ? cause.message : 'Dönem hesaplaması yapılamadı.');
    } finally { setCalculating(false); }
  };

  const [weekChoicesChecked, setWeekChoicesChecked] = useState<string[]>([]);
  const saveSnapshot = async () => {
    if (!preview || !canApproveEarnings(preview.result)) return;
    const latest = history.find((item) => (item.input as { periodStart?: string } | null)?.periodStart === preview.periodStart);
    const periodLines = preview.result.lines.filter((line) => line.payrollPeriodStartDate === preview.periodStart);
    const amount = periodLines.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0);
    const old = latest?.result.totalAmountMinor;
    const delta = old === undefined || old === null ? 'Önceki onaylı hesap yok.' : `Önceki onaylı tutara göre fark: ${money(amount - old)}.`;
    const amountLabel = preview.version.profile.mode === 'MONTHLY_GROSS' ? 'Seçili dönem ek tahmini brüt' : 'Seçili dönem çalışmasından tahmini brüt';
    const baseNote = preview.version.profile.mode === 'MONTHLY_GROSS' ? 'Aylık brüt baz bu ek tutara eklenmemiştir.' : 'Tutar, kaydedilmiş fiilî çalışma saatleri içindir.';
    Alert.alert('Hesabı onayla', `Bu önizleme yerel, değiştirilemez bir kayıt olarak saklanacak.\n\n${amountLabel}: ${money(amount)}\n${delta}\n\n${baseNote}`, [
      { text: 'Vazgeç', style: 'cancel' }, { text: 'Onayla ve sakla', onPress: () => { void (async () => {
        setSaving(true);
        try {
          await saveApprovedEarningsSnapshot(database, { calculationId: preview.input.calculationId,
            createdAtUtc: preview.input.calculatedAtUtc, profileId: preview.version.profileId,
            profileVersion: preview.version.profileVersion, ruleVersionId: preview.version.ruleVersionId,
            input: { ...preview.input, periodStart: preview.periodStart, periodEnd: preview.periodEnd,
              confirmedCompleteLocalWeeks: preview.input.completeWeekStarts,
              copiedSettings: preview.version.profile, copiedRules: preview.version.rules },
            result: { ...preview.result, totalAmountMinor: amount,
              lines: periodLines, snapshot: { ...preview.result.snapshot!, lines: periodLines } } });
          setPreview(null); setHistory(await listApprovedEarningsSnapshots(database));
          Alert.alert('Hesap saklandı', 'Onaylı geçmiş kaydı değiştirilemez ve ayar değişiklikleriyle güncellenmez.');
        } catch (cause) { Alert.alert('Hesap saklanamadı', cause instanceof Error ? cause.message : 'Önizlemeyi yenileyip tekrar dene.'); }
        finally { setSaving(false); }
      })(); } },
    ]);
  };

  const showGross = shouldShowGrossEstimate(version?.profile.mode ?? null);
  const periodStartUtc = toUtcMidnight(period.start, version?.profile.timezone ?? 'Europe/Istanbul');
  const periodEndUtc = toUtcMidnight(period.end, version?.profile.timezone ?? 'Europe/Istanbul');
  const periodRecords = records.filter(({ record }) => record.startedAtUtc < periodEndUtc && record.endedAtUtc > periodStartUtc);
  let actualNetMinutes: number | null = 0;
  for (const { record, timedBreaks } of periodRecords) {
    const clippedStart = Math.max(Date.parse(record.startedAtUtc), Date.parse(periodStartUtc));
    const clippedEnd = Math.min(Date.parse(record.endedAtUtc), Date.parse(periodEndUtc));
    let breaksInPeriod: number;
    const spansWholeRecord = clippedStart === Date.parse(record.startedAtUtc) && clippedEnd === Date.parse(record.endedAtUtc);
    if (spansWholeRecord) breaksInPeriod = record.breakMinutes;
    else if (record.breakMinutes === 0) breaksInPeriod = 0;
    else if (timedBreaks.length > 0) breaksInPeriod = timedBreaks.reduce((sum, item) => sum + Math.max(0, Math.min(Date.parse(item.endedAtUtc), clippedEnd) - Math.max(Date.parse(item.startedAtUtc), clippedStart)) / 60_000, 0);
    else { actualNetMinutes = null; break; }
    actualNetMinutes += Math.max(0, (clippedEnd - clippedStart) / 60_000 - breaksInPeriod);
  }
  const linkedPlannedMinutes = periodRecords.reduce((total, { record }) => {
    if (!record.planned) return total;
    const starts = getLocalDateTimeCandidates(record.planned.startLocalDateTime, record.timezone);
    const ends = getLocalDateTimeCandidates(record.planned.endLocalDateTime, record.timezone);
    if (starts.length !== 1 || ends.length !== 1) return total;
    const start = Date.parse(starts[0]); const end = Date.parse(ends[0]);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? total + Math.max(0, Math.min(end, Date.parse(periodEndUtc)) - Math.max(start, Date.parse(periodStartUtc))) / 60_000 : total;
  }, 0);
  const periodLines = preview?.result.lines.filter((line) => line.payrollPeriodStartDate === preview.periodStart) ?? [];
  const incrementalAmount = periodLines.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0);

  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Kazanç dönemi yükleniyor</Text></View>;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
    <Text style={[styles.eyebrow, { color: theme.accent }]}>DÖNEM ÖZETİ</Text>
    <Text style={[styles.title, { color: theme.foreground }]}>Kazanç</Text>
    <View style={styles.periodRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Önceki bordro dönemi" onPress={() => { setPeriodMonth((month) => shiftYearMonth(month, -1)); setWeekChoicesChecked([]); }}><Text style={[styles.arrow, { color: theme.accent }]}>‹</Text></Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.periodTitle, { color: theme.foreground }]}>{formatLocalDate(period.start, { month: 'short' })} – {formatLocalDate(addCalendarDays(period.end, -1), { month: 'short' })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Sonraki bordro dönemi" onPress={() => { setPeriodMonth((month) => shiftYearMonth(month, 1)); setWeekChoicesChecked([]); }}><Text style={[styles.arrow, { color: theme.accent }]}>›</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/earnings-settings' as never)} style={[styles.settingsLink, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Ücret ve kural ayarları</Text><Text style={{ color: theme.accent }}>Düzenle ›</Text></Pressable>
    {error ? <View style={[styles.notice, { borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Veriler yüklenemedi</Text><Text style={[styles.body, { color: theme.muted }]}>{error}</Text><Pressable onPress={() => void reload()}><Text style={{ color: theme.accent, fontWeight: '700' }}>Yeniden dene</Text></Pressable></View> : null}
    {!version ? <View style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Ücret ayarları henüz yok</Text><Text style={[styles.body, { color: theme.muted }]}>Ücret seçimini kendin yap. Ücret girmeden de devam edebilirsin.</Text></View> : null}
    <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.foreground }]}>Çalışma özeti</Text>
      <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Fiilî net çalışma süresi</Text><Text style={[styles.metric, { color: theme.foreground }]}>{actualNetMinutes === null ? 'Belirsiz' : `${(actualNetMinutes / 60).toFixed(1)} sa`}</Text></View>
      {actualNetMinutes === null ? <Text style={[styles.caption, { color: theme.muted }]}>Dönem sınırından geçen bir kaydın mola saati bilinmiyor; net süreyi bu dönem için ayıramadık.</Text> : null}
      <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Planı kayıtlı vardiyalar</Text><Text style={[styles.metric, { color: theme.foreground }]}>{(linkedPlannedMinutes / 60).toFixed(1)} sa</Text></View>
      <Text style={[styles.caption, { color: theme.muted }]}>Planlanan süre yalnız fiilî kayda bağlı vardiyalardan toplanmıştır; tam takvim planı değildir.</Text>
    </View>
    <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.foreground }]}>Net ödeme takibi</Text>
      <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Bordro neti</Text><Text style={[styles.metric, { color: theme.foreground }]}>{paymentLedger?.statement ? money(paymentLedger.statement.amountMinor) : 'Bilinmiyor'}</Text></View>
      <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Bu döneme atanmış ödemeler</Text><Text style={[styles.metric, { color: theme.foreground }]}>{money(paymentLedger?.reconciliation.allocatedPaymentMinor ?? 0)}</Text></View>
      <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Bordro neti ile kayıtlı ödeme farkı</Text><Text style={[styles.metric, { color: theme.accent }]}>{paymentDifference(paymentLedger?.reconciliation.differenceMinor ?? null)}</Text></View>
      <Text style={[styles.caption, { color: theme.muted }]}>Bu tutarlar kullanıcı kayıtlarıdır; bordro neti ile ödeme arasındaki fark dışında brüt-net karşılaştırması yapılmaz.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/net-payments', params: { periodMonth } } as never)} style={[styles.primary, { backgroundColor: theme.accent }]}><Text style={styles.primaryText}>Bordro ve ödemeleri yönet</Text></Pressable>
    </View>
    {showGross ? <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.foreground }]}>Brüt tahmin</Text>
      {version?.profile.mode === 'MONTHLY_GROSS' && version.profile.monthlyGrossMinor !== null ? <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>Aylık brüt baz (ayar)</Text><Text style={[styles.metric, { color: theme.foreground }]}>{money(version.profile.monthlyGrossMinor)}</Text></View> : null}
      {preview?.result.status === 'COMPLETE' ? <View style={styles.metricRow}><Text style={[styles.body, { color: theme.muted }]}>{version?.profile.mode === 'MONTHLY_GROSS' ? 'Seçili dönem ek tahmini brüt' : 'Seçili dönem çalışmasından tahmini brüt'}</Text><Text style={[styles.metric, { color: theme.accent }]}>{money(incrementalAmount)}</Text></View> : <Text style={[styles.body, { color: theme.muted }]}>Önizleme tam değil. Eksik kaynaklar giderilene kadar kesin tutar gösterilmez.</Text>}
      {version?.profile.mode === 'MONTHLY_GROSS' ? <Text style={[styles.caption, { color: theme.muted }]}>Bu ek tutar aylık brüt baz ücretini tekrar eklemez; dönem toplam brüt maaşı olarak gösterilmez.</Text> : null}
    </View> : null}
    {showGross && weekChoices.length > 0 ? <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.foreground }]}>Haftalık kayıt kapsamı</Text>
      <Text style={[styles.body, { color: theme.muted }]}>Her yerel hafta için tüm fiilî çalışma kayıtlarının girildiğini ayrı ayrı doğrula. Kayıtların veritabanında bulunması tek başına tamlık kanıtı değildir.</Text>
      {weekChoices.map((week) => { const checked = weekChoicesChecked.includes(week); return <Pressable key={week} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setWeekChoicesChecked((current) => checked ? current.filter((item) => item !== week) : [...current, week])} style={[styles.week, { borderColor: theme.border }]}><Text style={{ color: checked ? theme.accent : theme.muted, fontWeight: '800' }}>{checked ? '✓' : '○'}</Text><Text style={[styles.body, { color: theme.foreground }]}>{week} haftasındaki tüm kayıtlarımı girdim</Text></Pressable>; })}
      <Pressable accessibilityRole="button" disabled={calculating} onPress={() => void calculate()} style={[styles.primary, { backgroundColor: theme.accent }]}>{calculating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Brüt tahmin önizlemesi oluştur</Text>}</Pressable>
    </View> : null}
    {preview ? <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.foreground }]}>Önizleme · {preview.result.status === 'COMPLETE' ? 'TAM' : preview.result.status === 'NO_GROSS_MODE' ? 'BRÜT HESABI YOK' : preview.result.status === 'PARTIAL' ? 'KISMİ' : 'TUTAR BEKLETİLDİ'}</Text>
      {preview.result.uncertainties.map((item, index) => <Text key={`${item.code}-${index}`} style={[styles.body, { color: theme.muted }]}>• {item.message}</Text>)}
      {periodLines.map((line) => <View key={line.id} style={[styles.detail, { borderColor: theme.border }]}>
        <Text style={[styles.body, { color: theme.foreground }]}>{shortTime(line.startedAtUtc)}–{shortTime(line.endedAtUtc)} · {line.minutes} dk</Text>
        <Text style={[styles.caption, { color: theme.muted }]}>{line.selectedRuleName ?? 'Eşleştirilen kural yok'} · {line.hourlyBaseDescription} · katsayı {line.multiplierBasisPoints === null ? 'belirsiz' : `${(line.multiplierBasisPoints / 10_000).toFixed(2)}×`}</Text>
        <Text style={[styles.caption, { color: theme.muted }]}>{line.selectionReason}</Text>
        {preview.result.status === 'COMPLETE' && line.amountMinor !== null ? <Text style={{ color: theme.accent, fontWeight: '700' }}>{money(line.amountMinor)}</Text> : null}
      </View>)}
      {canApproveEarnings(preview.result) ? <Pressable accessibilityRole="button" disabled={saving} onPress={saveSnapshot} style={[styles.primary, { backgroundColor: theme.accent }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Önizlemeyi onayla ve geçmişe kaydet</Text>}</Pressable> : <Text style={[styles.caption, { color: theme.muted }]}>Kısmi veya bekletilen önizlemeler onaylı hesap olarak kaydedilemez.</Text>}
    </View> : null}
    <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.cardTitle, { color: theme.foreground }]}>Onaylı hesap geçmişi</Text>
      {history.length ? history.map((item) => <View key={item.calculationId} style={[styles.historyItem, { borderColor: theme.border }]}><Text style={[styles.body, { color: theme.foreground }]}>{shortTime(item.createdAtUtc)}{showGross ? ` · ${money(item.result.totalAmountMinor ?? 0)}` : ''}</Text><Text style={[styles.caption, { color: theme.muted }]}>{showGross ? `Sabit kayıt · ${item.result.snapshot?.ruleSetVersionId ?? item.ruleVersionId}` : 'Önceden onaylanmış yerel kayıt'}</Text></View>) : <Text style={[styles.body, { color: theme.muted }]}>Henüz onaylanmış bir hesap yok. Önizleme geçmişe yazılmaz.</Text>}
    </View>
  </ScrollView>;
}

function paymentDifference(value: number | null): string {
  if (value === null) return 'Bilinmiyor';
  if (value === 0) return '0 TL';
  return `${money(Math.abs(value))} ${value > 0 ? 'düşük kayıtlı ödeme' : 'fazla kayıtlı ödeme'}`;
}

const styles = StyleSheet.create({ container: { padding: 18, paddingBottom: 44, gap: 12 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 10 }, title: { fontSize: 30, fontWeight: '800' }, periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }, arrow: { fontSize: 34, paddingHorizontal: 10 }, periodTitle: { fontSize: 17, fontWeight: '700', textTransform: 'capitalize' }, settingsLink: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row' }, summary: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 }, notice: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }, cardTitle: { fontSize: 17, fontWeight: '800' }, body: { fontSize: 14, lineHeight: 20 }, caption: { fontSize: 12, lineHeight: 17 }, metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, metric: { fontSize: 17, fontWeight: '800' }, week: { minHeight: 48, flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingHorizontal: 12 }, primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' }, detail: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10, gap: 5 }, historyItem: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 3 } });
