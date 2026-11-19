import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getDayEntry, upsertDayEntry, deleteDayEntry, type DayEntryPatch } from '@/src/data/dayEntryRepository';
import type { LeaveType } from '@/src/domain/payroll/types';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

const LEAVE_OPTIONS: { value: LeaveType | 'NONE'; label: string }[] = [
  { value: 'NONE', label: 'İzin yok' },
  { value: 'ANNUAL', label: 'Yıllık izin' },
  { value: 'UNPAID', label: 'Ücretsiz izin' },
  { value: 'SICK', label: 'Hastalık raporu' },
  { value: 'EXCUSE', label: 'Mazeret izni' },
  { value: 'MATERNITY', label: 'Doğum izni' },
  { value: 'BEREAVEMENT', label: 'Ölüm izni' },
  { value: 'SOCIAL', label: 'Sosyal izin' },
  { value: 'HOURLY', label: 'Saatlik izin' },
];

function formatDisplayDate(localDate: string): string {
  const [y, m, d] = localDate.split('-');
  return `${d}.${m}.${y}`;
}

export default function DayEditScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const localDate = date ?? '';

  const [overtimeText, setOvertimeText] = useState('0');
  const [lateEarlyText, setLateEarlyText] = useState('0');
  const [leaveType, setLeaveType] = useState<LeaveType | 'NONE'>('NONE');
  const [leaveHalfDay, setLeaveHalfDay] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!localDate) return;
    let active = true;
    void getDayEntry(database, localDate).then((entry) => {
      if (!active) return;
      if (entry) {
        setOvertimeText(String(entry.overtimeMinutes));
        setLateEarlyText(String(entry.lateEarlyMinutes));
        setLeaveType(entry.leaveType ?? 'NONE');
        setLeaveHalfDay(entry.leaveHalfDay);
        setNote(entry.note ?? '');
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [database, localDate]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const overtime = Math.max(0, Number(overtimeText) || 0);
      const lateEarly = Math.max(0, Number(lateEarlyText) || 0);
      const hasData = overtime > 0 || lateEarly > 0 || leaveType !== 'NONE' || note.trim().length > 0;

      if (!hasData) {
        await deleteDayEntry(database, localDate);
      } else {
        const patch: DayEntryPatch = {
          overtimeMinutes: overtime,
          lateEarlyMinutes: lateEarly,
          leaveType: leaveType === 'NONE' ? null : leaveType,
          leaveHalfDay: leaveType !== 'NONE' && leaveHalfDay,
          note: note.trim() || null,
        };
        await upsertDayEntry(database, localDate, patch);
      }
      router.back();
    } catch {
      setSaving(false);
    }
  }, [database, localDate, overtimeText, lateEarlyText, leaveType, leaveHalfDay, note, router]);

  if (!localDate) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>{formatDisplayDate(localDate)}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>Kapat</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.muted }]}>Fazla mesai (dakika)</Text>
        <TextInput
          style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={overtimeText}
          onChangeText={setOvertimeText}
          keyboardType="number-pad"
          accessibilityLabel="Fazla mesai dakika"
        />

        <Text style={[styles.label, { color: theme.muted }]}>Geç kalma / erken çıkış (dakika)</Text>
        <TextInput
          style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={lateEarlyText}
          onChangeText={setLateEarlyText}
          keyboardType="number-pad"
          accessibilityLabel="Geç kalma dakika"
        />

        <Text style={[styles.label, { color: theme.muted }]}>İzin türü</Text>
        <View style={styles.leaveGrid}>
          {LEAVE_OPTIONS.map((opt) => {
            const selected = opt.value === leaveType;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => { setLeaveType(opt.value); if (opt.value === 'NONE') setLeaveHalfDay(false); }}
                style={[
                  styles.leaveChip,
                  {
                    backgroundColor: selected ? theme.accentSurface : theme.surface,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={{ color: selected ? theme.accent : theme.foreground, fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {leaveType !== 'NONE' && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: leaveHalfDay }}
            onPress={() => setLeaveHalfDay((v) => !v)}
            style={[styles.checkbox, { borderColor: theme.border }]}
          >
            <View style={[styles.checkboxBox, { backgroundColor: leaveHalfDay ? theme.accent : 'transparent', borderColor: theme.border }]} />
            <Text style={{ color: theme.foreground, fontSize: layout.type.body }}>Yarım gün</Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: theme.muted }]}>Not</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={note}
          onChangeText={setNote}
          placeholder="İsteğe bağlı not"
          placeholderTextColor={theme.muted}
          multiline
          accessibilityLabel="Gün notu"
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: theme.primaryAction, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: theme.onPrimaryAction, fontWeight: '700', fontSize: layout.type.body }}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screen.horizontal,
    paddingVertical: 12,
  },
  title: {
    fontSize: layout.type.section,
    fontWeight: '800',
  },
  form: {
    paddingHorizontal: layout.screen.horizontal,
    paddingBottom: 24,
    gap: 8,
  },
  label: {
    fontSize: layout.type.caption,
    fontWeight: '600',
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: layout.radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: layout.type.body,
    minHeight: layout.control.minHeight,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  leaveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  leaveChip: {
    borderWidth: 1,
    borderRadius: layout.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: layout.screen.horizontal,
    paddingBottom: layout.screen.bottom,
    paddingTop: 8,
  },
  saveButton: {
    borderRadius: layout.radius.control,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: layout.control.minHeight,
  },
});
