import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getAllExtraIncomes, createExtraIncome, deleteExtraIncome, type CreateExtraIncomeInput } from '@/src/data/extraIncomeRepository';
import type { ExtraIncome, ExtraIncomeType, ExtraIncomeFrequency } from '@/src/domain/payroll/types';
import { formatTryMinor, parseTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceChip } from '@/src/components/ui/ChoiceChip';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';

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

export default function AdditionalIncomeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [incomes, setIncomes] = useState<ExtraIncome[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ExtraIncomeType>('BONUS');
  const [frequency, setFrequency] = useState<ExtraIncomeFrequency>('MONTHLY');
  const [amountText, setAmountText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadIncomes = useCallback(async () => {
    const list = await getAllExtraIncomes(database);
    setIncomes(list);
  }, [database]);

  useEffect(() => { void loadIncomes(); }, [loadIncomes]);

  const handleAdd = useCallback(async () => {
    setSaving(true);
    try {
      const amount = parseTryMinor(amountText);
      const input: CreateExtraIncomeInput = { type, amountMinor: amount, frequency };
      await createExtraIncome(database, input);
      setAmountText('');
      setShowForm(false);
      await loadIncomes();
    } catch {
      // keep form open
    } finally {
      setSaving(false);
    }
  }, [database, type, frequency, amountText, loadIncomes]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Sil', 'Bu ek geliri silmek istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteExtraIncome(database, id);
          await loadIncomes();
        },
      },
    ]);
  }, [database, loadIncomes]);

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

      <FlatList
        data={incomes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="cash-outline" size={32} color={theme.muted} />
              <Text style={{ color: theme.muted, textAlign: 'center', fontSize: layout.type.body }}>
                Henüz ek gelir eklenmemiş.
              </Text>
            </View>
          </Card>
        }
        renderItem={({ item }) => {
          const info = typeInfo(item.type);
          return (
            <Card>
              <View style={styles.incomeRow}>
                <View style={[styles.typeIcon, { backgroundColor: theme.accentSurface }]}>
                  <Ionicons accessible={false} name={info?.icon ?? 'cash-outline'} size={18} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontWeight: '700', fontSize: layout.type.body }}>
                    {info?.label ?? item.type}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>
                    {formatTryMinor(item.amountMinor)} · {FREQUENCY_OPTIONS.find((o) => o.value === item.frequency)?.label}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Sil" onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </Pressable>
              </View>
            </Card>
          );
        }}
      />

      {showForm ? (
        <View style={[styles.formSheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <CardHeader icon="add-circle-outline" title="Yeni Ek Gelir" />
          <View style={styles.chipGrid}>
            {TYPE_OPTIONS.map((opt) => (
              <ChoiceChip key={opt.value} label={opt.label} selected={opt.value === type} onPress={() => setType(opt.value)} icon={opt.icon} />
            ))}
          </View>
          <View style={styles.chipGrid}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <ChoiceChip key={opt.value} label={opt.label} selected={opt.value === frequency} onPress={() => setFrequency(opt.value)} icon={opt.icon} />
            ))}
          </View>
          <TextInput
            style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.background }]}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="Tutar (₺)"
            placeholderTextColor={theme.muted}
            keyboardType="decimal-pad"
            accessibilityLabel="Ek gelir tutarı"
          />
          <ActionButton label={saving ? 'Ekleniyor…' : 'Ekle'} onPress={handleAdd} disabled={saving} loading={saving} icon="checkmark" />
        </View>
      ) : (
        <View style={styles.footer}>
          <ActionButton label="Yeni Ek Gelir" onPress={() => setShowForm(true)} icon="add" />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  headerBar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: layout.screen.horizontal, marginBottom: 8 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  list: { paddingHorizontal: layout.screen.horizontal, gap: 10, paddingBottom: 16 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  incomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  formSheet: { borderTopWidth: 1, padding: layout.screen.horizontal, gap: 12 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body, minHeight: layout.control.minHeight },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8 },
});
