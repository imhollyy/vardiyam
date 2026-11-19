import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getAllExtraIncomes, createExtraIncome, deleteExtraIncome, type CreateExtraIncomeInput } from '@/src/data/extraIncomeRepository';
import type { ExtraIncome, ExtraIncomeType, ExtraIncomeFrequency } from '@/src/domain/payroll/types';
import { formatTryMinor, parseTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

const TYPE_OPTIONS: { value: ExtraIncomeType; label: string }[] = [
  { value: 'BONUS', label: 'Prim' },
  { value: 'TRANSPORT', label: 'Yol' },
  { value: 'FOOD', label: 'Yemek' },
  { value: 'SOCIAL', label: 'Sosyal yardım' },
  { value: 'PERFORMANCE', label: 'Performans' },
  { value: 'OTHER', label: 'Diğer' },
];

const FREQUENCY_OPTIONS: { value: ExtraIncomeFrequency; label: string }[] = [
  { value: 'MONTHLY', label: 'Aylık' },
  { value: 'ONCE', label: 'Tek seferlik' },
  { value: 'QUARTERLY', label: '3 ayda bir' },
  { value: 'BIANNUAL', label: '6 ayda bir' },
  { value: 'ANNUAL', label: 'Yıllık' },
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Ek Gelirler</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>Kapat</Text>
        </Pressable>
      </View>

      <FlatList
        data={incomes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{ color: theme.muted, textAlign: 'center', paddingVertical: 32 }}>
            Henüz ek gelir eklenmemiş.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.foreground, fontWeight: '700', fontSize: layout.type.body }}>
                {TYPE_OPTIONS.find((o) => o.value === item.type)?.label ?? item.type}
              </Text>
              <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>
                {formatTryMinor(item.amountMinor)} · {FREQUENCY_OPTIONS.find((o) => o.value === item.frequency)?.label}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sil" onPress={() => handleDelete(item.id)}>
              <Text style={{ color: theme.danger, fontWeight: '600' }}>Sil</Text>
            </Pressable>
          </View>
        )}
      />

      {showForm ? (
        <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.chipRow}>
            {TYPE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setType(opt.value)}
                style={[styles.chip, { backgroundColor: opt.value === type ? theme.accentSurface : theme.background, borderColor: opt.value === type ? theme.accent : theme.border }]}
              >
                <Text style={{ color: opt.value === type ? theme.accent : theme.foreground, fontSize: 12, fontWeight: '600' }}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setFrequency(opt.value)}
                style={[styles.chip, { backgroundColor: opt.value === frequency ? theme.accentSurface : theme.background, borderColor: opt.value === frequency ? theme.accent : theme.border }]}
              >
                <Text style={{ color: opt.value === frequency ? theme.accent : theme.foreground, fontSize: 12, fontWeight: '600' }}>{opt.label}</Text>
              </Pressable>
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
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={handleAdd}
            style={[styles.addButton, { backgroundColor: theme.primaryAction }]}
          >
            <Text style={{ color: theme.onPrimaryAction, fontWeight: '700' }}>{saving ? 'Ekleniyor…' : 'Ekle'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowForm(true)}
            style={[styles.addButton, { backgroundColor: theme.primaryAction }]}
          >
            <Text style={{ color: theme.onPrimaryAction, fontWeight: '700', fontSize: layout.type.body }}>Yeni Ek Gelir</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screen.horizontal, marginBottom: 16 },
  title: { fontSize: layout.type.title, fontWeight: '800' },
  list: { paddingHorizontal: layout.screen.horizontal, gap: 10, paddingBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: layout.radius.card, borderWidth: 1, padding: 16 },
  form: { borderTopWidth: 1, padding: layout.screen.horizontal, gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: layout.radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body },
  addButton: { borderRadius: layout.radius.control, paddingVertical: 14, alignItems: 'center', minHeight: layout.control.minHeight },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8 },
});
