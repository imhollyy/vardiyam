import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import {
  getAllExtraIncomes,
  createExtraIncome,
  updateExtraIncome,
  deleteExtraIncome,
  type CreateExtraIncomeInput,
} from '@/src/data/extraIncomeRepository';
import type { ExtraIncome, ExtraIncomeType, ExtraIncomeFrequency } from '@/src/domain/payroll/types';
import { formatMoneyInput, formatTryMinor, parseTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { MoneyField } from '@/src/components/ui/MoneyField';
import { ChoiceChip } from '@/src/components/ui/ChoiceChip';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { getLocalToday } from '@/src/features/shifts/dates';

const TYPE_OPTIONS: { value: ExtraIncomeType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'BONUS', label: 'Prim', icon: 'trophy-outline' },
  { value: 'TRANSPORT', label: 'Yol', icon: 'bus-outline' },
  { value: 'FOOD', label: 'Yemek', icon: 'restaurant-outline' },
  { value: 'SOCIAL', label: 'Sosyal yardım', icon: 'people-outline' },
  { value: 'PERFORMANCE', label: 'Performans', icon: 'rocket-outline' },
  { value: 'OTHER', label: 'Diğer', icon: 'ellipsis-horizontal-outline' },
];

const FREQUENCY_OPTIONS: { value: ExtraIncomeFrequency; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'MONTHLY', label: 'Aylık', icon: 'calendar-outline' },
  { value: 'ONCE', label: 'Tek seferlik', icon: 'finger-print-outline' },
  { value: 'QUARTERLY', label: '3 ayda bir', icon: 'repeat-outline' },
  { value: 'BIANNUAL', label: '6 ayda bir', icon: 'swap-vertical-outline' },
  { value: 'ANNUAL', label: 'Yıllık', icon: 'gift-outline' },
];

function emptyForm() {
  return {
    type: 'BONUS' as ExtraIncomeType,
    frequency: 'MONTHLY' as ExtraIncomeFrequency,
    amountText: '',
    customName: '',
    firstPaymentDate: getLocalToday('Europe/Istanbul'),
  };
}

export default function AdditionalIncomeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [incomes, setIncomes] = useState<ExtraIncome[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadIncomes = useCallback(async () => {
    const list = await getAllExtraIncomes(database);
    setIncomes(list);
  }, [database]);

  useFocusEffect(useCallback(() => { void loadIncomes(); }, [loadIncomes]));

  const monthlyTotal = useMemo(
    () => incomes.filter((i) => i.frequency === 'MONTHLY').reduce((s, i) => s + i.amountMinor, 0),
    [incomes],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setSheetVisible(true);
  };

  const openEdit = (item: ExtraIncome) => {
    setEditingId(item.id);
    setForm({
      type: item.type,
      frequency: item.frequency,
      amountText: formatMoneyInput(String(Math.round(item.amountMinor / 100))),
      customName: item.customName ?? '',
      firstPaymentDate: item.firstPaymentDate ?? getLocalToday('Europe/Istanbul'),
    });
    setFormError(null);
    setSheetVisible(true);
  };

  const handleSave = useCallback(async () => {
    setFormError(null);
    let amountMinor: number;
    try { amountMinor = parseTryMinor(form.amountText); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'Tutar geçersiz.'); return; }
    if (form.type === 'OTHER' && form.customName.trim() === '') {
      setFormError('Diğer için özel bir ad girin.'); return;
    }
    setSaving(true);
    try {
      const input: CreateExtraIncomeInput = {
        type: form.type,
        amountMinor,
        frequency: form.frequency,
        customName: form.type === 'OTHER' ? form.customName.trim() : null,
        firstPaymentDate: form.frequency !== 'MONTHLY' ? form.firstPaymentDate : null,
      };
      if (editingId) {
        await updateExtraIncome(database, editingId, input);
      } else {
        await createExtraIncome(database, input);
      }
      setSheetVisible(false);
      await loadIncomes();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }, [database, editingId, form, loadIncomes]);

  const handleDelete = useCallback(async () => {
    if (!editingId) return;
    setSheetVisible(false);
    await deleteExtraIncome(database, editingId);
    await loadIncomes();
  }, [database, editingId, loadIncomes]);

  const typeInfo = (val: ExtraIncomeType) => TYPE_OPTIONS.find((o) => o.value === val);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <PageHeading eyebrow="EK GELİRLER" title="Ek Gelirler" />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={theme.muted} />
        </Pressable>
      </View>

      {/* Bu dönem aylık ek gelir toplamı */}
      {monthlyTotal > 0 ? (
        <View style={[styles.periodCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted }}>
            Bu dönem tahmini (aylık)
          </Text>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: theme.ink }}>
            {formatTryMinor(monthlyTotal)}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={incomes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Card>
            <EmptyState icon="cash-outline" title="Ek gelir yok" body="Henüz ek gelir eklenmemiş." />
          </Card>
        }
        renderItem={({ item }) => {
          const info = typeInfo(item.type);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${info?.label ?? item.type} düzenle`}
              onPress={() => openEdit(item)}
            >
              <Card>
                <View style={styles.incomeRow}>
                  <View style={[styles.typeIcon, { backgroundColor: theme.surfaceMuted }]}>
                    <Ionicons accessible={false} name={info?.icon ?? 'cash-outline'} size={18} color={theme.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bold, color: theme.ink, fontSize: layout.type.body }}>
                      {item.type === 'OTHER' && item.customName ? item.customName : (info?.label ?? item.type)}
                    </Text>
                    <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption }}>
                      {formatTryMinor(item.amountMinor)} · {FREQUENCY_OPTIONS.find((o) => o.value === item.frequency)?.label}
                    </Text>
                  </View>
                  <Ionicons accessible={false} name="chevron-forward" size={16} color={theme.muted} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        <ActionButton label="Yeni Ek Gelir" onPress={openAdd} icon="add" />
      </View>

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <CardHeader icon={editingId ? 'pencil-outline' : 'add-circle-outline'} title={editingId ? 'Ek Geliri Düzenle' : 'Yeni Ek Gelir'} />
        <View style={styles.chipGrid}>
          {TYPE_OPTIONS.map((opt) => (
            <ChoiceChip key={opt.value} label={opt.label} selected={opt.value === form.type} onPress={() => setForm((f) => ({ ...f, type: opt.value }))} icon={opt.icon} />
          ))}
        </View>
        <View style={styles.chipGrid}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <ChoiceChip key={opt.value} label={opt.label} selected={opt.value === form.frequency} onPress={() => setForm((f) => ({ ...f, frequency: opt.value }))} icon={opt.icon} />
          ))}
        </View>
        {form.type === 'OTHER' && (
          <TextInput
            style={[styles.input, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.background, fontFamily: fonts.medium }]}
            value={form.customName}
            onChangeText={(v) => setForm((f) => ({ ...f, customName: v }))}
            placeholder="Gelir adı (örn. Yakacak yardımı)"
            placeholderTextColor={theme.muted}
            maxLength={200}
            accessibilityLabel="Özel gelir adı"
          />
        )}
        <MoneyField
          label="Tutar"
          value={form.amountText}
          onChangeText={(v) => setForm((f) => ({ ...f, amountText: v }))}
          placeholder="0"
        />
        {form.frequency !== 'MONTHLY' && (
          <DateTimePickerField
            mode="date"
            label="İlk ödeme tarihi"
            value={form.firstPaymentDate}
            timezone="Europe/Istanbul"
            onChange={(v) => setForm((f) => ({ ...f, firstPaymentDate: v }))}
            onError={setFormError}
          />
        )}
        {formError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.danger }]}>{formError}</Text> : null}
        <ActionButton label={saving ? 'Kaydediliyor…' : (editingId ? 'Güncelle' : 'Ekle')} onPress={handleSave} disabled={saving} loading={saving} icon="checkmark" />
        {editingId ? (
          <ActionButton label="Sil" onPress={handleDelete} variant="destructive" icon="trash-outline" />
        ) : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  headerBar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: layout.screen.horizontal, marginBottom: 8 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  periodCard: { marginHorizontal: layout.screen.horizontal, marginBottom: 8, borderWidth: 1, borderRadius: layout.radius.card, padding: 14, gap: 4 },
  list: { paddingHorizontal: layout.screen.horizontal, gap: 10, paddingBottom: 16 },
  incomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body, minHeight: layout.control.minHeight },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8 },
  errorText: { fontFamily: fonts.bold, fontSize: layout.type.caption, lineHeight: 20 },
});
