import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { allocatePayment, createNetPayment, deleteAllocation, deleteNetPayment, getOrCreatePayrollPeriod, getPeriodPaymentLedger, listNetPayments, listPayrollPeriods, listPayslipNetVersions, savePayslipNet, updateAllocation, updateNetPayment, type NetPayment, type PayrollPeriod } from '@/src/data/paymentRepository';
import { getLatestEarningsProfile as loadProfile } from '@/src/data/earningsRepository';
import { formatTryMinor, parseTryMinor, type PaymentMethod } from '@/src/domain/payments';
import { payrollPeriodForMonth } from '@/src/features/payments/period';
import { isEarningsSettings } from '@/src/features/earnings/profile';
import { getLocalToday, shiftYearMonth } from '@/src/features/shifts/dates';
import { colors } from '@/src/theme/tokens';

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'BANK', label: 'Banka' }, { id: 'CASH', label: 'Elden' }, { id: 'OTHER', label: 'Diğer' },
];
const eventId = () => `ledger-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const recordId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const nowUtc = () => { const now = new Date(); now.setUTCSeconds(0, 0); return now.toISOString(); };
const monthOf = (date: string) => date.slice(0, 7);

function moneyInput(minor: number | null | undefined): string { return minor === null || minor === undefined ? '' : formatTryMinor(minor).replace(/\u00a0₺$/, ''); }
function periodLabel(period: PayrollPeriod): string { return `${period.startLocalDate} – ${period.endExclusiveLocalDate}`; }

export default function NetPaymentsScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ periodMonth?: string }>();
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? colors.dark : colors.light;
  const [periodMonth, setPeriodMonth] = useState(params.periodMonth ?? getLocalToday('Europe/Istanbul').slice(0, 7));
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getPeriodPaymentLedger>> | null>(null);
  const [statementHistory, setStatementHistory] = useState<Awaited<ReturnType<typeof listPayslipNetVersions>>>([]);
  const [payments, setPayments] = useState<NetPayment[]>([]);
  const [statementValue, setStatementValue] = useState('');
  const [statementNote, setStatementNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(getLocalToday('Europe/Istanbul'));
  const [paymentValue, setPaymentValue] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK');
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const profile = await loadProfile(database);
      const settings = profile?.profile;
      const identity = payrollPeriodForMonth(periodMonth,
        settings && isEarningsSettings(settings) ? settings.payrollPeriodStartDay : 1,
        settings && isEarningsSettings(settings) ? settings.timezone : 'Europe/Istanbul');
      const allPeriods = await listPayrollPeriods(database);
      const current = (selectedPeriodId && allPeriods.find((item) => item.id === selectedPeriodId)) || await getOrCreatePayrollPeriod(database, identity);
      const [items, allPayments, revisions] = await Promise.all([getPeriodPaymentLedger(database, current.id), listNetPayments(database), listPayslipNetVersions(database, current.id)]);
      setPeriod(current); setPeriods(allPeriods); setLedger(items); setPayments(allPayments); setStatementHistory(revisions);
      setStatementValue(moneyInput(items.statement?.amountMinor)); setStatementNote(items.statement?.note ?? '');
      setAllocationValues(Object.fromEntries(items.rows.map(({ id, amountMinor }) => [id, moneyInput(amountMinor)])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ödeme kayıtları yüklenemedi.'); }
    finally { setLoading(false); }
  }, [database, periodMonth, selectedPeriodId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const displayPeriods = useMemo(() => {
    const current = period ? periods.filter((item) => item.id !== period.id) : periods;
    return period ? [period, ...current] : periods;
  }, [period, periods]);

  const saveStatement = async () => {
    if (!period) return;
    setSaving(true);
    try {
      await savePayslipNet(database, { periodId: period.id, amountMinor: parseTryMinor(statementValue, true), note: statementNote.trim() || null, atUtc: nowUtc(), eventId: eventId() });
      await reload(); Alert.alert('Bordro neti kaydedildi', 'Önceki değer değişiklik geçmişinde korundu.');
    } catch (cause) { Alert.alert('Kaydedilemedi', cause instanceof Error ? cause.message : 'Bordro neti kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const savePayment = async () => {
    setSaving(true);
    try {
      const input = { paymentLocalDate: paymentDate, amountMinor: parseTryMinor(paymentValue), method: paymentMethod, description: paymentDescription.trim() || null, atUtc: nowUtc(), eventId: eventId() };
      if (editingPayment) await updateNetPayment(database, { ...input, id: editingPayment });
      else await createNetPayment(database, { ...input, id: recordId('payment') });
      setEditingPayment(null); setPaymentValue(''); setPaymentDescription(''); await reload();
      Alert.alert('Ödeme kaydedildi', 'Ödeme tarihi seçilen bordro dönemine otomatik atanmadı.');
    } catch (cause) { Alert.alert('Ödeme kaydedilemedi', cause instanceof Error ? cause.message : 'Ödeme kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const removePayment = (payment: NetPayment) => Alert.alert('Ödemeyi sil?', `${formatTryMinor(payment.amountMinor)} kaydı pasife alınacak. Dönem dağıtımları denetim geçmişinde korunacak ve mutabakattan çıkarılacak.`, [
    { text: 'Vazgeç', style: 'cancel' }, { text: 'Onayla ve sil', style: 'destructive', onPress: () => { void (async () => {
      setSaving(true); try { await deleteNetPayment(database, { id: payment.id, atUtc: nowUtc(), eventId: eventId() }); await reload(); }
      catch (cause) { Alert.alert('Silinemedi', cause instanceof Error ? cause.message : 'Ödeme silinemedi.'); } finally { setSaving(false); }
    })(); } },
  ]);

  const saveAllocation = async (payment: NetPayment, allocationId?: string) => {
    if (!period) return;
    setSaving(true);
    try {
      const amountMinor = parseTryMinor(allocationValues[payment.id] ?? ''); const atUtc = nowUtc();
      if (allocationId) await updateAllocation(database, { id: allocationId, amountMinor, periodId: period.id, atUtc, eventId: eventId() });
      else await allocatePayment(database, { id: recordId('allocation'), paymentId: payment.id, periodId: period.id, amountMinor, atUtc, eventId: eventId() });
      await reload();
    } catch (cause) { Alert.alert('Dağıtım kaydedilemedi', cause instanceof Error ? cause.message : 'Dağıtım kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const confirmDeleteAllocation = (allocationId: string, amountMinor: number) => Alert.alert('Dönem dağıtımını kaldır?', `${formatTryMinor(amountMinor)} bu dönem mutabakatından çıkarılacak; ödeme kaydı korunacak.`, [
    { text: 'Vazgeç', style: 'cancel' }, { text: 'Dağıtımı kaldır', style: 'destructive', onPress: () => { void (async () => {
      setSaving(true); try { await deleteAllocation(database, { id: allocationId, atUtc: nowUtc(), eventId: eventId() }); await reload(); }
      catch (cause) { Alert.alert('Dağıtım kaldırılamadı', cause instanceof Error ? cause.message : 'Dağıtım kaldırılamadı.'); } finally { setSaving(false); }
    })(); } },
  ]);

  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Net ödeme kayıtları yükleniyor</Text></View>;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={{ color: theme.accent, fontWeight: '700' }}>‹ Kazanç ekranına dön</Text></Pressable>
    <Text style={[styles.title, { color: theme.foreground }]}>Net ödeme takibi</Text>
    {error ? <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={[styles.body, { color: theme.foreground }]}>{error}</Text><Pressable onPress={() => void reload()}><Text style={{ color: theme.accent }}>Yeniden dene</Text></Pressable></View> : null}
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Bordro dönemi</Text>
      <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Önceki dönem" onPress={() => { setSelectedPeriodId(null); setPeriodMonth((value) => shiftYearMonth(value, -1)); }}><Text style={[styles.arrow, { color: theme.accent }]}>‹</Text></Pressable><Text style={[styles.body, { color: theme.foreground }]}>{period ? periodLabel(period) : periodMonth}</Text><Pressable accessibilityRole="button" accessibilityLabel="Sonraki dönem" onPress={() => { setSelectedPeriodId(null); setPeriodMonth((value) => shiftYearMonth(value, 1)); }}><Text style={[styles.arrow, { color: theme.accent }]}>›</Text></Pressable></View>
      {displayPeriods.length > 1 ? <><Text style={[styles.caption, { color: theme.muted }]}>Kayıtlı dönemler (sınırlar değiştirilmeden saklanır)</Text><View style={styles.wrap}>{displayPeriods.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === period?.id }} onPress={() => { setSelectedPeriodId(item.id); setPeriodMonth(monthOf(item.startLocalDate)); }} style={[styles.chip, { borderColor: theme.border }]}><Text style={[styles.caption, { color: theme.foreground }]}>{periodLabel(item)}</Text></Pressable>)}</View></> : null}
      <Text style={[styles.caption, { color: theme.muted }]}>Ödeme tarihinden dönem otomatik belirlenmez. Ödeme dağıtımı aşağıdan ayrıca seçilir.</Text>
    </View>
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Bordroda yazan net</Text>
      <TextInput accessibilityLabel="Bordro net tutarı" keyboardType="decimal-pad" value={statementValue} onChangeText={setStatementValue} placeholder="35.000,50" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.foreground, borderColor: theme.border }]} />
      <TextInput accessibilityLabel="Bordro notu" value={statementNote} onChangeText={setStatementNote} placeholder="İsteğe bağlı not" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.foreground, borderColor: theme.border }]} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveStatement()} style={[styles.primary, { backgroundColor: theme.accent }]}><Text style={styles.primaryText}>{saving ? 'Kaydediliyor…' : ledger?.statement ? 'Bordro netini düzenle' : 'Bordro netini kaydet'}</Text></Pressable>
      {ledger?.statement ? <Text style={[styles.caption, { color: theme.muted }]}>Son kayıt v{ledger.statement.version} · Önceki tutarlar değişiklik geçmişinde saklanır.</Text> : <Text style={[styles.caption, { color: theme.muted }]}>Bordro neti girilmezse dönem farkı bilinmiyor kalır.</Text>}
      {statementHistory.length > 1 ? <View style={styles.history}><Text style={[styles.caption, { color: theme.muted, fontWeight: '700' }]}>Bordro neti değişiklik geçmişi</Text>{statementHistory.map((entry) => <Text key={entry.version} style={[styles.caption, { color: theme.muted }]}>v{entry.version} · {formatTryMinor(entry.amountMinor)} · {entry.createdAtUtc.slice(0, 10)}{entry.note ? ` · ${entry.note}` : ''}</Text>)}</View> : null}
    </View>
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.foreground }]}>{editingPayment ? 'Ödemeyi düzenle' : 'Gerçek ödeme ekle'}</Text>
      <TextInput accessibilityLabel="Ödeme tarihi, yıl ay gün" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-AA-GG" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.foreground, borderColor: theme.border }]} />
      <TextInput accessibilityLabel="Gerçek ödeme tutarı" keyboardType="decimal-pad" value={paymentValue} onChangeText={setPaymentValue} placeholder="30.000,00" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.foreground, borderColor: theme.border }]} />
      <View style={styles.wrap}>{METHODS.map((method) => <Pressable key={method.id} accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === method.id }} onPress={() => setPaymentMethod(method.id)} style={[styles.chip, { borderColor: paymentMethod === method.id ? theme.accent : theme.border }]}><Text style={{ color: theme.foreground }}>{method.label}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Ödeme açıklaması" value={paymentDescription} onChangeText={setPaymentDescription} placeholder="Açıklama (isteğe bağlı)" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.foreground, borderColor: theme.border }]} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void savePayment()} style={[styles.primary, { backgroundColor: theme.accent }]}><Text style={styles.primaryText}>{saving ? 'Kaydediliyor…' : editingPayment ? 'Ödeme değişikliklerini kaydet' : 'Ödemeyi kaydet'}</Text></Pressable>
      {editingPayment ? <Pressable accessibilityRole="button" onPress={() => { setEditingPayment(null); setPaymentValue(''); setPaymentDescription(''); }}><Text style={{ color: theme.accent }}>Düzenlemeyi iptal et</Text></Pressable> : null}
    </View>
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Bu dönem mutabakatı</Text>
      <Summary label="Bordro neti" value={ledger?.statement ? formatTryMinor(ledger.statement.amountMinor) : 'Bilinmiyor'} theme={theme} />
      <Summary label="Bu döneme atanmış net ödeme" value={formatTryMinor(ledger?.reconciliation.allocatedPaymentMinor ?? 0)} theme={theme} />
      <Summary label="Kayıtlı ödeme farkı" value={differenceLabel(ledger?.reconciliation.differenceMinor ?? null)} theme={theme} />
      <Summary label="Henüz bir döneme atanmamış toplam bakiye" value={formatTryMinor(ledger?.reconciliation.unallocatedPaymentMinor ?? 0)} theme={theme} />
      <Text style={[styles.caption, { color: theme.muted }]}>Fark yalnızca bordro neti ile açıkça bu döneme ayrılmış net ödemeleri karşılaştırır. Tahmini brütle kıyaslanmaz.</Text>
    </View>
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Ödeme geçmişi ve dönem dağılımı</Text>
      {payments.length === 0 ? <Text style={[styles.body, { color: theme.muted }]}>Henüz ödeme kaydı yok.</Text> : null}
      {payments.map((payment) => {
        const row = ledger?.rows.find((item) => item.id === payment.id);
        return <View key={payment.id} style={[styles.payment, { borderColor: theme.border }]}>
          <Text style={[styles.body, { color: theme.foreground }]}>{payment.paymentLocalDate} · {formatTryMinor(payment.amountMinor)} · {METHODS.find((item) => item.id === payment.method)?.label}</Text>
          {payment.description ? <Text style={[styles.caption, { color: theme.muted }]}>{payment.description}</Text> : null}
          {payment.deletedAtUtc ? <Text style={[styles.caption, { color: theme.muted }]}>Silindi — denetim geçmişinde</Text> : <>
            <Text style={[styles.caption, { color: theme.muted }]}>Dönem ataması öncesi kalan toplam: {formatTryMinor(payment.unallocatedMinor)}</Text>
            {row ? <View style={styles.row}><TextInput accessibilityLabel="Bu dönem ödeme dağıtım tutarı" keyboardType="decimal-pad" value={allocationValues[payment.id] ?? moneyInput(row.amountMinor)} onChangeText={(value) => setAllocationValues((current) => ({ ...current, [payment.id]: value }))} style={[styles.input, styles.flex, { color: theme.foreground, borderColor: theme.border }]} /><Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveAllocation(payment, row.allocationId)}><Text style={{ color: theme.accent, fontWeight: '700' }}>Dağıtımı düzenle</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDeleteAllocation(row.allocationId, row.amountMinor)}><Text style={{ color: theme.accent }}>Kaldır</Text></Pressable></View> : <View style={styles.row}><TextInput accessibilityLabel="Bu döneme ayrılacak ödeme tutarı" keyboardType="decimal-pad" value={allocationValues[payment.id] ?? moneyInput(payment.unallocatedMinor)} onChangeText={(value) => setAllocationValues((current) => ({ ...current, [payment.id]: value }))} placeholder="Döneme ayrılacak tutar" placeholderTextColor={theme.muted} style={[styles.input, styles.flex, { color: theme.foreground, borderColor: theme.border }]} /><Pressable accessibilityRole="button" disabled={saving || payment.unallocatedMinor === 0} onPress={() => void saveAllocation(payment)}><Text style={{ color: theme.accent, fontWeight: '700' }}>Bu döneme aktar</Text></Pressable></View>}
            <View style={styles.wrap}><Pressable accessibilityRole="button" onPress={() => { setEditingPayment(payment.id); setPaymentDate(payment.paymentLocalDate); setPaymentValue(moneyInput(payment.amountMinor)); setPaymentMethod(payment.method); setPaymentDescription(payment.description ?? ''); }}><Text style={{ color: theme.accent }}>Düzenle</Text></Pressable><Pressable accessibilityRole="button" onPress={() => removePayment(payment)}><Text style={{ color: theme.accent }}>Onayla ve sil</Text></Pressable></View>
          </>}
        </View>;
      })}
    </View>
  </ScrollView>;
}

function Summary({ label, value, theme }: { label: string; value: string; theme: typeof colors.light | typeof colors.dark }) {
  return <View style={styles.row}><Text style={[styles.body, styles.flex, { color: theme.muted }]}>{label}</Text><Text accessibilityLiveRegion="polite" style={[styles.body, { color: theme.foreground, fontWeight: '800' }]}>{value}</Text></View>;
}

function differenceLabel(value: number | null): string {
  if (value === null) return 'Bordro neti girilmedi — bilinmiyor';
  if (value === 0) return 'Fark 0 TL';
  if (value > 0) return `Bordroya göre ${formatTryMinor(value)} düşük kayıtlı ödeme`;
  return `Bordroya göre ${formatTryMinor(Math.abs(value))} fazla kayıtlı ödeme`;
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 48, gap: 12 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }, title: { fontSize: 27, fontWeight: '800' }, card: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 12 }, heading: { fontSize: 17, fontWeight: '800' }, body: { fontSize: 14, lineHeight: 20 }, caption: { fontSize: 12, lineHeight: 17 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, minHeight: 40 }, arrow: { fontSize: 30, paddingHorizontal: 12 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 }, flex: { flex: 1 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, chip: { minHeight: 42, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 }, primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 12 }, primaryText: { color: '#fff', fontWeight: '800' }, payment: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 }, history: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 5 },
});
