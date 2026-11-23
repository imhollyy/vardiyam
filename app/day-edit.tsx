import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getDayEntry, upsertDayEntry, deleteDayEntry, type DayEntryPatch } from '@/src/data/dayEntryRepository';
import type { LeaveType } from '@/src/domain/payroll/types';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceChip } from '@/src/components/ui/ChoiceChip';
import { Stepper } from '@/src/components/ui/Stepper';
import { ActionButton } from '@/src/components/ui/ActionButton';

const LEAVE_OPTIONS: { value: LeaveType | 'NONE'; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; description?: string }[] = [
  { value: 'NONE', label: 'İzin yok', icon: 'close-circle-outline' },
  { value: 'ANNUAL', label: 'Yıllık izin', icon: 'sunny-outline', description: 'Yıllık ücretli izin hakkı' },
  { value: 'UNPAID', label: 'Ücretsiz izin', icon: 'wallet-outline', description: 'Ücretten düşülür' },
  { value: 'SICK', label: 'Hastalık raporu', icon: 'medkit-outline', description: 'SGK raporu ile' },
  { value: 'EXCUSE', label: 'Mazeret izni', icon: 'hand-left-outline' },
  { value: 'MATERNITY', label: 'Doğum izni', icon: 'heart-outline' },
  { value: 'BEREAVEMENT', label: 'Ölüm izni', icon: 'flower-outline' },
  { value: 'SOCIAL', label: 'Sosyal izin', icon: 'people-outline' },
  { value: 'HOURLY', label: 'Saatlik izin', icon: 'time-outline', description: 'Saat bazında izin' },
];

function formatDisplayDate(localDate: string): string {
  const [y, m, d] = localDate.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export default function DayEditScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const localDate = date ?? '';

  const [overtimeHours, setOvertimeHours] = useState(0);
  const [lateEarlyHours, setLateEarlyHours] = useState(0);
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
        setOvertimeHours(entry.overtimeMinutes / 60);
        setLateEarlyHours(entry.lateEarlyMinutes / 60);
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
      const overtime = Math.max(0, Math.round(overtimeHours * 60));
      const lateEarly = Math.max(0, Math.round(lateEarlyHours * 60));
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
  }, [database, localDate, overtimeHours, lateEarlyHours, leaveType, leaveHalfDay, note, router]);

  const handleReset = useCallback(() => {
    setOvertimeHours(0);
    setLateEarlyHours(0);
    setLeaveType('NONE');
    setLeaveHalfDay(false);
    setNote('');
  }, []);

  if (!localDate) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.handle} accessibilityElementsHidden>
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
      </View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>{formatDisplayDate(localDate)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={theme.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Card>
          <CardHeader icon="timer-outline" title="Fazla Mesai" />
          <Stepper value={overtimeHours} onValueChange={setOvertimeHours} min={0} max={12} step={0.5} />
        </Card>

        <Card>
          <CardHeader icon="trending-down-outline" title="Geç Kalma / Erken Çıkış" />
          <Stepper value={lateEarlyHours} onValueChange={setLateEarlyHours} min={0} max={8} step={0.5} />
        </Card>

        <Card>
          <CardHeader icon="bed-outline" title="İzin Türü" />
          <View style={styles.leaveGrid}>
            {LEAVE_OPTIONS.map((opt) => (
              <ChoiceChip
                key={opt.value}
                label={opt.label}
                selected={opt.value === leaveType}
                onPress={() => { setLeaveType(opt.value); if (opt.value === 'NONE') setLeaveHalfDay(false); }}
                icon={opt.icon}
                description={opt.description}
              />
            ))}
          </View>
        </Card>

        {leaveType !== 'NONE' && (
          <Card>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: leaveHalfDay }}
              accessibilityLabel="Yarım gün"
              onPress={() => setLeaveHalfDay((v) => !v)}
              style={styles.checkRow}
            >
              <View style={[styles.checkBox, { borderColor: leaveHalfDay ? theme.accent : theme.border, backgroundColor: leaveHalfDay ? theme.accent : 'transparent' }]}>
                {leaveHalfDay && <Ionicons name="checkmark" size={14} color={theme.onPrimaryAction} />}
              </View>
              <Text style={{ color: theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>Yarım gün</Text>
            </Pressable>
          </Card>
        )}

        <Card>
          <CardHeader icon="chatbubble-outline" title="Not" />
          <TextInput
            style={[styles.noteInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={note}
            onChangeText={setNote}
            placeholder="İsteğe bağlı not"
            placeholderTextColor={theme.muted}
            multiline
            accessibilityLabel="Gün notu"
          />
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sıfırla"
          onPress={handleReset}
          style={[styles.resetButton, { borderColor: theme.border }]}
        >
          <Ionicons name="refresh" size={18} color={theme.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ActionButton label={saving ? 'Kaydediliyor…' : 'Kaydet'} onPress={handleSave} disabled={saving} loading={saving} icon="checkmark" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screen.horizontal, paddingVertical: 8 },
  title: { fontSize: layout.type.section, fontWeight: '800' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  form: { paddingHorizontal: layout.screen.horizontal, paddingBottom: 16, gap: layout.space.md },
  leaveGrid: { gap: layout.space.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  noteInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body, minHeight: 80, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8 },
  resetButton: { width: 48, height: layout.control.minHeight, borderWidth: 1.5, borderRadius: layout.radius.control, alignItems: 'center', justifyContent: 'center' },
});
