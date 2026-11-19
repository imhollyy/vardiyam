import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import type { WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

const WORK_SCHEDULE_OPTIONS: { value: WorkSchedule; label: string }[] = [
  { value: 'MON_FRI', label: 'Pazartesi – Cuma' },
  { value: 'MON_SAT', label: 'Pazartesi – Cumartesi' },
  { value: 'EVERY_DAY', label: 'Her gün' },
];

const SHIFT_PATTERN_OPTIONS: { value: ShiftPattern; label: string }[] = [
  { value: 'FIXED_DAY', label: 'Sabit gündüz' },
  { value: 'FIXED_NIGHT', label: 'Sabit gece' },
  { value: 'TWO_SHIFT', label: '2 vardiya' },
  { value: 'THREE_SHIFT', label: '3 vardiya' },
];

export default function ShiftChangeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>('MON_FRI');
  const [shiftPattern, setShiftPattern] = useState<ShiftPattern>('FIXED_DAY');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getSettings(database).then((s) => {
      if (!active) return;
      setWorkSchedule(s.workSchedule);
      setShiftPattern(s.shiftPattern);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [database]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateSettings(database, { workSchedule, shiftPattern });
      router.back();
    } catch {
      setSaving(false);
    }
  }, [database, workSchedule, shiftPattern, router]);

  if (!loaded) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Vardiya Değişikliği</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>İptal</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Çalışma düzeni</Text>
        {WORK_SCHEDULE_OPTIONS.map((opt) => {
          const selected = opt.value === workSchedule;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setWorkSchedule(opt.value)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? theme.accentSurface : theme.surface,
                  borderColor: selected ? theme.accent : theme.border,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.accent : theme.foreground, fontWeight: selected ? '700' : '500', fontSize: layout.type.body }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}

        <Text style={[styles.sectionTitle, { color: theme.foreground, marginTop: 24 }]}>Vardiya düzeni</Text>
        {SHIFT_PATTERN_OPTIONS.map((opt) => {
          const selected = opt.value === shiftPattern;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setShiftPattern(opt.value)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? theme.accentSurface : theme.surface,
                  borderColor: selected ? theme.accent : theme.border,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.accent : theme.foreground, fontWeight: selected ? '700' : '500', fontSize: layout.type.body }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screen.horizontal,
    marginBottom: 24,
  },
  title: {
    fontSize: layout.type.title,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: layout.screen.horizontal,
    gap: 10,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: layout.type.section,
    fontWeight: '700',
    marginBottom: 4,
  },
  option: {
    borderWidth: 1.5,
    borderRadius: layout.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: layout.control.minHeight,
    justifyContent: 'center',
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
