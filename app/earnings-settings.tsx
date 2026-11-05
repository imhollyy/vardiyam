import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';

import { appendEarningsProfileVersion, getLatestEarningsProfile } from '@/src/data/earningsRepository';
import { createDefaultRules, createDefaultSettings, isEarningsSettings, type EarningsSettings } from '@/src/features/earnings/profile';
import type { EarningsRule, GrossPayMode } from '@/src/domain/earnings';
import { colors } from '@/src/theme/tokens';
import { getLocalDateTimeCandidates } from '@/src/domain/work-record';
import { addCalendarDays, type LocalDate } from '@/src/domain/shift-cycle';
import { getLocalToday } from '@/src/features/shifts/dates';

const MODES: { id: GrossPayMode; label: string }[] = [
  { id: 'MONTHLY_GROSS', label: 'Aylık brüt' }, { id: 'HOURLY_GROSS', label: 'Saatlik brüt' },
  { id: 'NET_ONLY', label: 'Yalnız net takibi' }, { id: 'SKIP', label: 'Ücret girmeden kullan' },
];
const RULES: { kind: EarningsRule['kind']; label: string }[] = [
  { kind: 'EXTRA_HOURS', label: 'Fazla sürelerle çalışma' }, { kind: 'OVERTIME', label: 'Fazla çalışma' },
  { kind: 'CALENDAR_WEEKEND', label: 'Takvim hafta sonu' }, { kind: 'WORKPLACE_REST_DAY', label: 'İşyeri hafta tatili' },
  { kind: 'PUBLIC_HOLIDAY', label: 'Resmî tatil' }, { kind: 'WORKPLACE_HOLIDAY', label: 'İşyeri özel tatili' },
];

function inputUtc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function localDateForInstant(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseMinorUnits(value: string): number | null {
  if (!value.trim()) return null;
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return Number.NaN;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  const amount = Number(cents);
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}

function parseRateBasisPoints(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const extraBasisPoints = Number(BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0'));
  if (!Number.isSafeInteger(extraBasisPoints) || extraBasisPoints < 0 || extraBasisPoints > 50_000) return null;
  return 10_000 + extraBasisPoints;
}

export default function EarningsSettingsScreen() {
  const database = useAppDatabase();
  const router = useRouter();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;
  const [settings, setSettings] = useState<EarningsSettings>(createDefaultSettings());
  const [rules, setRules] = useState<EarningsRule[]>(createDefaultRules());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [monthly, setMonthly] = useState('');
  const [hourly, setHourly] = useState('');
  const [divider, setDivider] = useState('225');
  const [weekly, setWeekly] = useState('45');
  const [periodDay, setPeriodDay] = useState('1');
  const [holidaySource, setHolidaySource] = useState('');
  const [holidayVersion, setHolidayVersion] = useState('');
  const [coveredFrom, setCoveredFrom] = useState('');
  const [coveredTo, setCoveredTo] = useState('');
  const [holidayDates, setHolidayDates] = useState('');
  const [restDates, setRestDates] = useState('');
  const [workplaceHolidayDates, setWorkplaceHolidayDates] = useState('');
  const [rates, setRates] = useState<Record<string, string>>({});
  const [payEffectiveFrom, setPayEffectiveFrom] = useState(() => getLocalToday('Europe/Istanbul'));
  const [rulesEffectiveFrom, setRulesEffectiveFrom] = useState(() => getLocalToday('Europe/Istanbul'));

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setLoadError(null);
    (async () => {
      try {
        const current = await getLatestEarningsProfile<EarningsSettings, EarningsRule[]>(database);
        if (!active) return;
        if (current && isEarningsSettings(current.profile)) {
          setSettings(current.profile);
          setRules(current.rules);
          setPayEffectiveFrom(localDateForInstant(current.profile.payEffectiveFromUtc, current.profile.timezone));
          setRulesEffectiveFrom(localDateForInstant(current.profile.rulesEffectiveFromUtc, current.profile.timezone));
          setMonthly(current.profile.monthlyGrossMinor === null ? '' : (current.profile.monthlyGrossMinor / 100).toFixed(2));
          setHourly(current.profile.hourlyGrossMinor === null ? '' : (current.profile.hourlyGrossMinor / 100).toFixed(2));
          setDivider(String(current.profile.monthlyDividerMinutes / 60));
          setWeekly(String(current.profile.weeklyMinutes / 60));
          setPeriodDay(String(current.profile.payrollPeriodStartDay));
          setHolidaySource(current.profile.holidaySource); setHolidayVersion(current.profile.holidayVersion);
          setCoveredFrom(localDateForInstant(current.profile.holidayCoveredFromUtc, current.profile.timezone));
          setCoveredTo(localDateForInstant(new Date(Date.parse(current.profile.holidayCoveredToUtc) - 60_000).toISOString(), current.profile.timezone));
          setHolidayDates(current.profile.holidayWindows.map((window) => `${window.startsAtUtc.slice(0, 10)}${window.kind === 'HALF_DAY_HOLIDAY' ? '@13:00' : ''}`).join('\n'));
          setRestDates(current.profile.workplaceRestWindows.map((window) => window.startsAtUtc.slice(0, 10)).join('\n'));
          setWorkplaceHolidayDates(current.profile.workplaceHolidayWindows.map((window) => window.startsAtUtc.slice(0, 10)).join('\n'));
          setRates(Object.fromEntries(current.rules.map((rule) => [rule.kind, String((rule.multiplierBasisPoints / 10000 - 1) * 100)])));
        } else {
          const defaults = createDefaultSettings(); setSettings(defaults); setRules(createDefaultRules(defaults.mode));
          setPayEffectiveFrom(getLocalToday(defaults.timezone)); setRulesEffectiveFrom(getLocalToday(defaults.timezone));
        }
      } catch {
        if (active) setLoadError('Yerel ücret profili okunamadı. Yeniden yükleyip doğrulamadan ayar kaydedilemez.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [database]));

  const update = (patch: Partial<EarningsSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const save = async () => {
    if (loadError) return;
    const monthlyMinor = parseMinorUnits(monthly);
    const hourlyMinor = parseMinorUnits(hourly);
    const dividerHours = Number(divider); const weeklyHours = Number(weekly); const day = Number(periodDay);
    if ((monthlyMinor !== null && (!Number.isSafeInteger(monthlyMinor) || monthlyMinor < 0)) ||
      (hourlyMinor !== null && (!Number.isSafeInteger(hourlyMinor) || hourlyMinor < 0)) ||
      !Number.isFinite(dividerHours) || dividerHours <= 0 || !Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168 ||
      !Number.isInteger(day) || day < 1 || day > 28) {
      Alert.alert('Bilgileri kontrol et', 'Ücret, saat veya dönem başlangıcı geçerli değil.'); return;
    }
    if (settings.mode === 'MONTHLY_GROSS' && monthlyMinor === null || settings.mode === 'HOURLY_GROSS' && hourlyMinor === null) {
      Alert.alert('Ücret bilgisi gerekli', 'Seçtiğin brüt ücret türü için bir tutar gir.'); return;
    }
    const validLocalDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const candidates = getLocalDateTimeCandidates(`${value}T00:00`, settings.timezone);
      return candidates.length === 1 ? candidates[0] : null;
    };
    const payEffectiveFromUtc = validLocalDate(payEffectiveFrom);
    const rulesEffectiveFromUtc = validLocalDate(rulesEffectiveFrom);
    if (!payEffectiveFromUtc || !rulesEffectiveFromUtc) {
      Alert.alert('Geçerlilik tarihi geçersiz', 'Ücret ve kural geçerlilik başlangıcını geçerli yerel gün olarak gir.'); return;
    }
    const holidayWindows: EarningsSettings['holidayWindows'] = [];
    const localDayWindows = (text: string, prefix: string) => text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((dateValue, index) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error(`${prefix} günleri YYYY-AA-GG biçiminde girilmeli.`);
      const date = dateValue as LocalDate;
      const from = getLocalDateTimeCandidates(`${date}T00:00`, settings.timezone);
      const to = getLocalDateTimeCandidates(`${addCalendarDays(date, 1)}T00:00`, settings.timezone);
      if (from.length !== 1 || to.length !== 1) throw new Error(`${prefix} tarihi çözümlenemedi: ${dateValue}`);
      return { id: `${prefix}-${index}-${date}`, startsAtUtc: from[0], endedAtUtc: to[0] };
    });
    try {
      for (const [index, raw] of holidayDates.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).entries()) {
        const match = /^(\d{4}-\d{2}-\d{2})(?:@(\d{2}:\d{2}))?$/.exec(raw);
        if (!match) throw new Error('Tatil satırını YYYY-AA-GG veya YYYY-AA-GG@13:00 biçiminde yaz.');
        const date = match[1] as LocalDate;
        const startLocal = `${date}T${match[2] ?? '00:00'}`;
        const endLocal = `${addCalendarDays(date, 1)}T00:00`;
        const startCandidates = getLocalDateTimeCandidates(startLocal, settings.timezone);
        const endCandidates = getLocalDateTimeCandidates(endLocal, settings.timezone);
        if (startCandidates.length !== 1 || endCandidates.length !== 1) throw new Error(`Tatil tarihi çözümlenemedi: ${raw}`);
        holidayWindows.push({ id: `holiday-${index}-${date}`, kind: match[2] ? 'HALF_DAY_HOLIDAY' : 'PUBLIC_HOLIDAY', startsAtUtc: startCandidates[0], endedAtUtc: endCandidates[0] });
      }
    } catch (cause) {
      Alert.alert('Tatil listesi geçersiz', cause instanceof Error ? cause.message : 'Tatil tarihlerini kontrol et.'); return;
    }
    let workplaceRestWindows: EarningsSettings['workplaceRestWindows'];
    let workplaceHolidayWindows: EarningsSettings['workplaceHolidayWindows'];
    try { workplaceRestWindows = localDayWindows(restDates, 'rest'); workplaceHolidayWindows = localDayWindows(workplaceHolidayDates, 'workplace-holiday'); }
    catch (cause) { Alert.alert('İşyeri tarihleri geçersiz', cause instanceof Error ? cause.message : 'Tarihleri kontrol et.'); return; }
    let coverageFromUtc = '';
    let coverageToUtc = '';
    if (coveredFrom || coveredTo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(coveredFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(coveredTo) || coveredTo < coveredFrom) {
        Alert.alert('Kapsam tarihleri geçersiz', 'Kaynak kapsamı için başlangıç ve bitiş günlerini YYYY-AA-GG biçiminde gir.'); return;
      }
      const from = getLocalDateTimeCandidates(`${coveredFrom}T00:00`, settings.timezone);
      const to = getLocalDateTimeCandidates(`${addCalendarDays(coveredTo as LocalDate, 1)}T00:00`, settings.timezone);
      if (from.length !== 1 || to.length !== 1 || Date.parse(to[0]) <= Date.parse(from[0])) {
        Alert.alert('Kapsam tarihleri geçersiz', 'Kaynak aralığının yerel gün sınırları bu zaman diliminde çözümlenemedi.'); return;
      }
      coverageFromUtc = from[0]; coverageToUtc = to[0];
    }
    const next: EarningsSettings = {
      ...settings, monthlyGrossMinor: monthlyMinor, hourlyGrossMinor: hourlyMinor,
      payEffectiveFromUtc, rulesEffectiveFromUtc,
      monthlyDividerMinutes: Math.round(dividerHours * 60), weeklyMinutes: Math.round(weeklyHours * 60), payrollPeriodStartDay: day,
      holidaySource, holidayVersion,
      holidayCoveredFromUtc: coverageFromUtc,
      holidayCoveredToUtc: coverageToUtc,
      holidayNoWindowsConfirmed: settings.holidayNoWindowsConfirmed && Boolean(holidaySource.trim() && holidayVersion.trim() && coveredFrom && coveredTo),
      holidayWindows,
      workplaceRestWindows, workplaceHolidayWindows,
    };
    const rateInputs = createDefaultRules(next.mode).map((rule) => [rule.kind, rates[rule.kind] ?? String((rule.multiplierBasisPoints / 100 - 100).toFixed(2))] as const);
    const invalidRate = rateInputs.find(([, value]) => parseRateBasisPoints(value) === null);
    if (invalidRate) { Alert.alert('Oran geçersiz', 'Ek oranları yüzde olarak en fazla iki ondalık basamakla ve 0–500 aralığında gir.'); return; }
    const nextRules = createDefaultRules(next.mode).map((rule) => {
      const rate = rates[rule.kind] ?? String((rule.multiplierBasisPoints / 100 - 100).toFixed(2));
      return { ...rule, multiplierBasisPoints: parseRateBasisPoints(rate)!,
        amountBasis: rule.kind === 'NORMAL' && next.mode === 'MONTHLY_GROSS' ? 'INCLUDED_IN_BASE' as const : rule.amountBasis,
        effectiveFromUtc: rulesEffectiveFromUtc };
    });
    setSaving(true);
    try {
      const now = inputUtc(new Date().toISOString());
      const versionId = `workplace-rules-${Date.now()}`;
      await appendEarningsProfileVersion(database, 'default', next, nextRules, versionId, now);
      setSettings(next); setRules(nextRules);
      Alert.alert('Kaydedildi', 'Yeni ücret ve işyeri kuralı sürümü oluşturuldu. Önceki onaylı hesaplar değişmedi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch {
      Alert.alert('Kaydedilemedi', 'Yerel ayar sürümü oluşturulamadı. Önceki sürüm korundu.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Ayarlar yükleniyor</Text></View>;
  const field = (label: string, value: string, onChangeText: (value: string) => void, suffix?: string, keyboardType: 'decimal-pad' | 'number-pad' | 'default' = 'decimal-pad') => (
    <View style={[styles.fieldRow, { borderColor: theme.border }]}><View style={styles.flex}><Text style={[styles.label, { color: theme.muted }]}>{label}</Text><TextInput accessibilityLabel={label} keyboardType={keyboardType} value={value} onChangeText={onChangeText} style={[styles.input, { color: theme.foreground }]} /></View>{suffix ? <Text style={{ color: theme.muted }}>{suffix}</Text> : null}</View>
  );
  const toggle = (label: string, value: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.toggle, { borderColor: theme.border }]}><Text style={{ color: value ? theme.accent : theme.muted, fontWeight: '700' }}>{value ? '✓' : '○'}</Text><Text style={[styles.body, { color: theme.foreground }]}>{label}</Text></Pressable>
  );
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Kazanç ekranına dön" onPress={() => router.back()}><Text style={[styles.back, { color: theme.accent }]}>‹  Kazanç</Text></Pressable>
    <Text style={[styles.title, { color: theme.foreground }]}>Ücret ve işyeri kuralları</Text>
    <Text style={[styles.body, { color: theme.muted }]}>Ayar değişikliği yeni bir sürüm oluşturur. Önceki onaylı hesaplar sabit kalır. Bu değerler işyeri tahminidir; kesin yasal hakediş değildir.</Text>
    {loadError ? <View style={[styles.dateList, { borderColor: theme.border }]}><Text style={[styles.body, { color: theme.foreground }]}>{loadError}</Text><Pressable onPress={() => router.replace('/earnings-settings' as never)}><Text style={{ color: theme.accent, fontWeight: '700' }}>Yeniden yükle</Text></Pressable></View> : null}
    <Text style={[styles.section, { color: theme.foreground }]}>Ücret tercihi</Text>
    <View style={styles.modeGrid}>{MODES.map((mode) => <Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{ selected: settings.mode === mode.id }} onPress={() => update({ mode: mode.id })} style={[styles.mode, { borderColor: settings.mode === mode.id ? theme.accent : theme.border, backgroundColor: theme.surface }]}><Text style={{ color: theme.foreground, fontWeight: '600' }}>{mode.label}</Text></Pressable>)}</View>
    {settings.mode === 'MONTHLY_GROSS' ? field('Aylık brüt', monthly, setMonthly, 'TL') : null}
    {settings.mode === 'HOURLY_GROSS' ? field('Saatlik brüt', hourly, setHourly, 'TL') : null}
    {settings.mode === 'MONTHLY_GROSS' ? <>{field('Saat böleni önerisi', divider, setDivider, 'saat')}{toggle('225 saat önerisini bu hesap ayarı için açıkça onaylıyorum', settings.monthlyDividerConfirmed, () => update({ monthlyDividerConfirmed: !settings.monthlyDividerConfirmed }))}{toggle('Normal çalışma tutarı aylık brüt baza dahildir', settings.basePolicyConfirmed, () => update({ basePolicyConfirmed: !settings.basePolicyConfirmed }))}</> : null}
    <Text style={[styles.section, { color: theme.foreground }]}>Dönem ve sözleşme</Text>
    {field('Ücret profilinin geçerli olduğu gün', payEffectiveFrom, setPayEffectiveFrom, 'YYYY-AA-GG', 'default')}
    {field('İşyeri kurallarının geçerli olduğu gün', rulesEffectiveFrom, setRulesEffectiveFrom, 'YYYY-AA-GG', 'default')}
    {field('Haftalık sözleşme süresi', weekly, setWeekly, 'saat')}{field('Bordro döneminin başladığı gün', periodDay, setPeriodDay, 'gün', 'number-pad')}
    <Text style={[styles.body, { color: theme.muted }]}>Varsayılan başlangıç bugün. Geçmişe uygulamak istersen geçerlilik gününü açıkça değiştir; önceki dönemlerdeki ücret belirsiz kalırsa hesap bekletilir.</Text>
    {toggle('Denkleştirme veya haftalık hesaplama belirsizliği yok; bu işyeri bilgisini doğruladım', !settings.averagingOrEqualizationUnclear, () => update({ averagingOrEqualizationUnclear: !settings.averagingOrEqualizationUnclear }))}
    <Text style={[styles.section, { color: theme.foreground }]}>Bağımsız işyeri ek oranları</Text>
    {RULES.map(({ kind, label }) => field(label, rates[kind] ?? String((rules.find((rule) => rule.kind === kind)?.multiplierBasisPoints ?? 10_000) / 100 - 100), (value) => setRates((current) => ({ ...current, [kind]: value })), '% ek'))}
    <Text style={[styles.section, { color: theme.foreground }]}>Resmî tatil veri kapsamı</Text>
    {field('Kaynak adı', holidaySource, setHolidaySource, undefined, 'default')}{field('Veri sürümü', holidayVersion, setHolidayVersion, undefined, 'default')}
    {field('Kapsam başlangıç tarihi', coveredFrom, setCoveredFrom, 'YYYY-AA-GG', 'default')}{field('Kapsam bitiş tarihi', coveredTo, setCoveredTo, 'YYYY-AA-GG', 'default')}
    <View style={[styles.dateList, { borderColor: theme.border }]}><Text style={[styles.label, { color: theme.muted }]}>Resmî tatil tarihleri · her satırda YYYY-AA-GG veya yarım gün için YYYY-AA-GG@13:00</Text><TextInput accessibilityLabel="Resmî tatil tarihleri" multiline value={holidayDates} onChangeText={setHolidayDates} placeholder="2026-10-29\n2026-10-28@13:00" placeholderTextColor={theme.muted} style={[styles.input, styles.multiline, { color: theme.foreground }]} /></View>
    {toggle('Bu kaynak ve kapsamın tatil listesini doğruladım', settings.holidayNoWindowsConfirmed, () => update({ holidayNoWindowsConfirmed: !settings.holidayNoWindowsConfirmed }))}
    <Text style={[styles.body, { color: theme.muted }]}>Kaynak, sürüm ve tüm hesap haftalarını kapsayan tarih aralığı doğrulanmadıkça kesin tutar üretilmez. Yarım gün başlangıcı girilen yerel saattir.</Text>
    <Text style={[styles.section, { color: theme.foreground }]}>İşyeri gün sınıfları</Text>
    <View style={[styles.dateList, { borderColor: theme.border }]}><Text style={[styles.label, { color: theme.muted }]}>Gerçek işyeri hafta tatili günleri · YYYY-AA-GG (yerel tam gün)</Text><TextInput accessibilityLabel="İşyeri hafta tatili günleri" multiline value={restDates} onChangeText={setRestDates} style={[styles.input, styles.multiline, { color: theme.foreground }]} /></View>
    <View style={[styles.dateList, { borderColor: theme.border }]}><Text style={[styles.label, { color: theme.muted }]}>İşyeri özel tatil günleri · YYYY-AA-GG (yerel tam gün)</Text><TextInput accessibilityLabel="İşyeri özel tatil günleri" multiline value={workplaceHolidayDates} onChangeText={setWorkplaceHolidayDates} style={[styles.input, styles.multiline, { color: theme.foreground }]} /></View>
    {toggle('İşyeri hafta tatili ve özel gün listesini doğruladım; girilmeyen sınıf bulunmuyor', settings.workplaceWindowCoverageConfirmed, () => update({ workplaceWindowCoverageConfirmed: !settings.workplaceWindowCoverageConfirmed }))}
    <Pressable accessibilityRole="button" disabled={saving || Boolean(loadError)} onPress={save} style={[styles.save, { backgroundColor: theme.accent, opacity: loadError ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Sürümlü ayarları kaydet</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({ container: { padding: 20, paddingBottom: 48, gap: 12 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, flex: { flex: 1 }, back: { fontSize: 16, fontWeight: '700', paddingVertical: 8 }, title: { fontSize: 26, fontWeight: '800', marginTop: 4 }, body: { fontSize: 14, lineHeight: 20 }, section: { fontSize: 17, fontWeight: '800', marginTop: 14 }, modeGrid: { gap: 8 }, mode: { minHeight: 48, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 }, fieldRow: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, label: { fontSize: 12, fontWeight: '600' }, input: { minHeight: 36, fontSize: 16, paddingVertical: 3 }, multiline: { minHeight: 84, textAlignVertical: 'top' }, dateList: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }, toggle: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 12 }, save: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 12 }, saveText: { color: '#fff', fontWeight: '800', fontSize: 16 } });
