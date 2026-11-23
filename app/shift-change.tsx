import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import { listShiftTemplates, listShiftCycles, saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import type { WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import type { ShiftTemplate, CycleEntry, ShiftCycle } from '@/src/domain/shift-cycle/index';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes, legalMinBreakMinutes } from '@/src/config/shifts';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { ShiftKindBadge } from '@/src/components/shifts/ShiftKindBadge';

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

type TemplateDraft = { id: string; code: string; name: string; startLocalTime: string; endLocalTime: string; breakMinutes: number };

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
  const insets = useSafeAreaInsets();
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
          breakMinutes: t.breakMinutes,
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
      const draft = updated[index]!;
      const newDraft = { ...draft, [field]: value };
      const start = field === 'startLocalTime' ? value : draft.startLocalTime;
      const end = field === 'endLocalTime' ? value : draft.endLocalTime;
      if (isValidTime(start) && isValidTime(end) && start !== end) {
        const nominal = shiftNominalMinutes(start, end);
        newDraft.breakMinutes = Math.max(draft.breakMinutes, legalMinBreakMinutes(nominal));
      }
      updated[index] = newDraft;
      return updated;
    });
  }, []);

  const breakWarnings = useMemo(() => {
    return templateDrafts.map((t) => {
      if (!isValidTime(t.startLocalTime) || !isValidTime(t.endLocalTime) || t.startLocalTime === t.endLocalTime) return null;
      const nominal = shiftNominalMinutes(t.startLocalTime, t.endLocalTime);
      const legalMin = legalMinBreakMinutes(nominal);
      if (t.breakMinutes < legalMin) return `Yasal minimum mola: ${legalMin} dk`;
      return null;
    });
  }, [templateDrafts]);

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
        breakMinutes: td.breakMinutes,
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

  const footerPaddingBottom = Math.max(insets.bottom, layout.screen.bottom);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeading eyebrow="VARDİYA" title="Vardiya Değişikliği" />

        <Card>
          <CardHeader icon="calendar-outline" title="Çalışma düzeni" />
          <ChoiceGroup
            options={WORK_SCHEDULE_OPTIONS}
            selected={workSchedule}
            onSelect={handleWorkScheduleChange}
          />
        </Card>

        <Card>
          <CardHeader icon="repeat-outline" title="Vardiya düzeni" />
          <ChoiceGroup
            options={SHIFT_PATTERN_OPTIONS}
            selected={shiftPattern}
            onSelect={handleShiftPatternChange}
          />
        </Card>

        <Card>
          <CardHeader icon="time-outline" title="Vardiya saatleri" />
          {templateDrafts.map((td, i) => {
            const validTimes = isValidTime(td.startLocalTime) && isValidTime(td.endLocalTime) && td.startLocalTime !== td.endLocalTime;
            const previewTemplate = validTimes ? {
              id: td.id, code: td.code, name: td.name,
              startLocalTime: td.startLocalTime, endLocalTime: td.endLocalTime,
              standardMinutes: shiftNominalMinutes(td.startLocalTime, td.endLocalTime),
              breakMinutes: td.breakMinutes,
            } : undefined;
            return (
              <View key={td.id} style={styles.shiftRow}>
                <View style={styles.shiftRowTop}>
                  <Text style={[styles.shiftLabel, { color: theme.ink }]}>{td.name}</Text>
                  {previewTemplate ? <ShiftKindBadge kind="SHIFT" compact template={previewTemplate} /> : null}
                </View>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[styles.timeInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface, fontFamily: fonts.extraBold }]}
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
                    style={[styles.timeInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface, fontFamily: fonts.extraBold }]}
                    value={td.endLocalTime}
                    onChangeText={(v) => updateTemplateTime(i, 'endLocalTime', v)}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    accessibilityLabel={`${td.name} bitiş saati`}
                    maxLength={5}
                  />
                </View>
                {breakWarnings[i] ? <Text style={[styles.warning, { color: theme.warning }]} accessibilityRole="alert">{breakWarnings[i]}</Text> : null}
              </View>
            );
          })}
        </Card>

        {needsShiftSelect && (
          <Card>
            <CardHeader icon="swap-horizontal-outline" title="Bu hafta hangi vardiyadasın?" />
            <ChoiceGroup
              options={templateDrafts.map((td, i) => ({ value: String(i), label: `${td.name} (${td.startLocalTime} – ${td.endLocalTime})` }))}
              selected={String(currentShiftIndex)}
              onSelect={(v) => setCurrentShiftIndex(Number(v))}
            />
          </Card>
        )}

        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, paddingBottom: footerPaddingBottom }]}>
        <ActionButton
          label={saving ? 'Kaydediliyor…' : 'Kaydet'}
          onPress={() => { void handleSave(); }}
          disabled={!canSave || saving}
          loading={saving}
          icon="checkmark"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: layout.space.lg },
  shiftRow: { gap: layout.space.sm },
  shiftRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shiftLabel: { fontFamily: fonts.bold, fontSize: layout.type.body },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: layout.space.sm },
  timeInput: { flex: 1, minHeight: layout.control.minHeight, borderWidth: 1.5, borderRadius: layout.radius.input, paddingHorizontal: 12, fontSize: layout.type.body, textAlign: 'center' },
  warning: { fontSize: layout.type.caption, lineHeight: 18 },
  error: { textAlign: 'center', fontSize: layout.type.caption },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingTop: layout.space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
