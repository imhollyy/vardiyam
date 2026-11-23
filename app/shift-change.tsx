import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import { listShiftTemplates, listShiftCycles, saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import type { WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import type { ShiftTemplate, CycleEntry, ShiftCycle } from '@/src/domain/shift-cycle/index';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes, DAILY_STANDARD_BY_SCHEDULE } from '@/src/config/shifts';
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

type TemplateDraft = { id: string; code: string; name: string; startLocalTime: string; endLocalTime: string };

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function todayLocalDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function mondayOfThisWeek(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function buildCycleEntries(ws: WorkSchedule, sp: ShiftPattern, templateIds: string[]): CycleEntry[] {
  const workDays = ws === 'MON_FRI' ? 5 : ws === 'MON_SAT' ? 6 : 7;
  const offDays = 7 - workDays;
  const shift = (id: string): CycleEntry => ({ kind: 'SHIFT', templateId: id });
  const off = (): CycleEntry => ({ kind: 'OFF' });

  if (sp === 'FIXED_DAY' || sp === 'FIXED_NIGHT') {
    if (offDays === 0) return [shift(templateIds[0]!)];
    return [
      ...Array.from({ length: workDays }, () => shift(templateIds[0]!)),
      ...Array.from({ length: offDays }, () => off()),
    ];
  }

  const count = sp === 'TWO_SHIFT' ? 2 : 3;
  const entries: CycleEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offDays === 0) {
      entries.push(...Array.from({ length: 7 }, () => shift(templateIds[i]!)));
    } else {
      entries.push(...Array.from({ length: workDays }, () => shift(templateIds[i]!)));
      entries.push(...Array.from({ length: offDays }, () => off()));
    }
  }
  return entries;
}

export default function ShiftChangeScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>('MON_FRI');
  const [shiftPattern, setShiftPattern] = useState<ShiftPattern>('FIXED_DAY');
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraft[]>([]);
  const [currentShiftIndex, setCurrentShiftIndex] = useState(0);
  const [existingCycleId, setExistingCycleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const settings = await getSettings(database);
      const templates = await listShiftTemplates(database);
      const cycles = await listShiftCycles(database);
      if (!active) return;

      setWorkSchedule(settings.workSchedule);
      setShiftPattern(settings.shiftPattern);

      if (templates.length > 0) {
        setTemplateDrafts(templates.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          startLocalTime: t.startLocalTime,
          endLocalTime: t.endLocalTime,
        })));
      } else {
        const defaults = DEFAULT_SHIFT_HOURS[settings.workSchedule][settings.shiftPattern];
        setTemplateDrafts(defaults.map((h) => ({ id: randomUUID(), ...h })));
      }

      if (cycles.length > 0) setExistingCycleId(cycles[0]!.id);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [database]);

  const handleWorkScheduleChange = useCallback((ws: WorkSchedule) => {
    setWorkSchedule(ws);
    const defaults = DEFAULT_SHIFT_HOURS[ws][shiftPattern];
    setTemplateDrafts(defaults.map((h) => ({ id: randomUUID(), ...h })));
    setCurrentShiftIndex(0);
  }, [shiftPattern]);

  const handleShiftPatternChange = useCallback((sp: ShiftPattern) => {
    setShiftPattern(sp);
    const defaults = DEFAULT_SHIFT_HOURS[workSchedule][sp];
    setTemplateDrafts(defaults.map((h) => ({ id: randomUUID(), ...h })));
    setCurrentShiftIndex(0);
  }, [workSchedule]);

  const updateTemplateTime = useCallback((index: number, field: 'startLocalTime' | 'endLocalTime', value: string) => {
    setTemplateDrafts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, [field]: value };
      return updated;
    });
  }, []);

  const overtimeWarnings = useMemo(() => {
    const dailyStd = DAILY_STANDARD_BY_SCHEDULE[workSchedule];
    return templateDrafts.map((t) => {
      if (!isValidTime(t.startLocalTime) || !isValidTime(t.endLocalTime) || t.startLocalTime === t.endLocalTime) return null;
      const nominal = shiftNominalMinutes(t.startLocalTime, t.endLocalTime);
      const delta = nominal - dailyStd;
      if (delta <= 0) return null;
      const hours = Math.floor(delta / 60);
      const mins = delta % 60;
      return mins > 0 ? `+${hours} saat ${mins} dk/gün` : `+${hours} saat/gün`;
    });
  }, [templateDrafts, workSchedule]);

  const canSave = templateDrafts.every((t) =>
    isValidTime(t.startLocalTime) && isValidTime(t.endLocalTime) && t.startLocalTime !== t.endLocalTime,
  );

  const needsShiftSelect = shiftPattern === 'TWO_SHIFT' || shiftPattern === 'THREE_SHIFT';

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings(database, { workSchedule, shiftPattern });

      const templateIds = templateDrafts.map((td) => td.id);
      const templates: ShiftTemplate[] = templateDrafts.map((td) => ({
        id: td.id,
        code: td.code,
        name: td.name,
        startLocalTime: td.startLocalTime,
        endLocalTime: td.endLocalTime,
        standardMinutes: shiftNominalMinutes(td.startLocalTime, td.endLocalTime),
      }));

      const entries = buildCycleEntries(workSchedule, shiftPattern, templateIds);
      const anchor = mondayOfThisWeek();
      const startIndex = needsShiftSelect ? currentShiftIndex * 7 : 0;
      const effectiveFrom = todayLocalDate();

      const cycle: ShiftCycle = {
        id: existingCycleId ?? randomUUID(),
        name: 'Vardiya düzenim',
        timezone: 'Europe/Istanbul',
        anchorLocalDate: anchor,
        startIndex: startIndex % entries.length,
        entries,
      };

      await saveShiftSchedule(database, templates, cycle, effectiveFrom);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
      setSaving(false);
    }
  }, [database, workSchedule, shiftPattern, templateDrafts, currentShiftIndex, existingCycleId, needsShiftSelect, router]);

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
              onPress={() => handleWorkScheduleChange(opt.value)}
              style={[styles.option, { backgroundColor: selected ? theme.accentSurface : theme.surface, borderColor: selected ? theme.accent : theme.border }]}
            >
              <Text style={{ color: selected ? theme.accent : theme.foreground, fontWeight: selected ? '700' : '500', fontSize: layout.type.body }}>{opt.label}</Text>
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
              onPress={() => handleShiftPatternChange(opt.value)}
              style={[styles.option, { backgroundColor: selected ? theme.accentSurface : theme.surface, borderColor: selected ? theme.accent : theme.border }]}
            >
              <Text style={{ color: selected ? theme.accent : theme.foreground, fontWeight: selected ? '700' : '500', fontSize: layout.type.body }}>{opt.label}</Text>
            </Pressable>
          );
        })}

        <Text style={[styles.sectionTitle, { color: theme.foreground, marginTop: 24 }]}>Vardiya saatleri</Text>
        {templateDrafts.map((td, i) => (
          <View key={td.id} style={[styles.shiftRow, { borderColor: theme.border }]}>
            <Text style={[styles.shiftLabel, { color: theme.foreground }]}>{td.name}</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[styles.timeInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={td.startLocalTime}
                onChangeText={(v) => updateTemplateTime(i, 'startLocalTime', v)}
                placeholder="HH:MM"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                accessibilityLabel={`${td.name} başlangıç saati`}
                maxLength={5}
              />
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>–</Text>
              <TextInput
                style={[styles.timeInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={td.endLocalTime}
                onChangeText={(v) => updateTemplateTime(i, 'endLocalTime', v)}
                placeholder="HH:MM"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                accessibilityLabel={`${td.name} bitiş saati`}
                maxLength={5}
              />
            </View>
            {overtimeWarnings[i] && (
              <Text style={[styles.overtimeWarning, { color: theme.warning }]} accessibilityRole="alert">{overtimeWarnings[i]}</Text>
            )}
          </View>
        ))}

        {needsShiftSelect && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.foreground, marginTop: 24 }]}>Bu hafta hangi vardiyadasın?</Text>
            {templateDrafts.map((td, i) => {
              const selected = currentShiftIndex === i;
              return (
                <Pressable
                  key={td.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCurrentShiftIndex(i)}
                  style={[styles.option, { backgroundColor: selected ? theme.accentSurface : theme.surface, borderColor: selected ? theme.accent : theme.border }]}
                >
                  <Text style={{ color: selected ? theme.accent : theme.foreground, fontWeight: selected ? '700' : '500', fontSize: layout.type.body }}>
                    {td.name} ({td.startLocalTime} – {td.endLocalTime})
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}

        {error && (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSave || saving}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: canSave ? theme.primaryAction : theme.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: canSave ? theme.onPrimaryAction : theme.muted, fontWeight: '700', fontSize: layout.type.body }}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screen.horizontal, marginBottom: 24 },
  title: { fontSize: layout.type.title, fontWeight: '800' },
  content: { paddingHorizontal: layout.screen.horizontal, gap: 10, paddingBottom: 24 },
  sectionTitle: { fontSize: layout.type.section, fontWeight: '700', marginBottom: 4 },
  option: { borderWidth: 1.5, borderRadius: layout.radius.control, paddingHorizontal: 16, paddingVertical: 14, minHeight: layout.control.minHeight, justifyContent: 'center' },
  shiftRow: { borderWidth: 1, borderRadius: layout.radius.card, padding: 12, gap: 8 },
  shiftLabel: { fontSize: layout.type.body, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: layout.type.body, flex: 1, textAlign: 'center' },
  overtimeWarning: { fontSize: layout.type.caption, fontWeight: '600' },
  error: { marginTop: 12, textAlign: 'center', fontSize: layout.type.caption },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8 },
  saveButton: { borderRadius: layout.radius.control, paddingVertical: 16, alignItems: 'center', minHeight: layout.control.minHeight },
});
