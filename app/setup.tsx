import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { markSetupCompleted, updateSettings } from '@/src/data/settingsRepository';
import { saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import type { SalaryType, WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import type { ShiftTemplate, CycleEntry, ShiftCycle } from '@/src/domain/shift-cycle/index';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes, DAILY_STANDARD_BY_SCHEDULE } from '@/src/config/shifts';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { parseTryMinor, formatTryMinor } from '@/src/domain/money';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';

const STEPS = ['salary', 'workSchedule', 'shiftHours', 'currentShift', 'startDate', 'summary'] as const;
type StepId = (typeof STEPS)[number];

const STEP_META: Record<StepId, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string }> = {
  salary: { icon: 'wallet-outline', title: 'Maaş bilgilerin', subtitle: 'Aylık ücret ve maaş gününü gir.' },
  workSchedule: { icon: 'calendar-outline', title: 'Çalışma düzenin ne?', subtitle: 'Haftanın hangi günleri çalışıyorsun?' },
  shiftHours: { icon: 'time-outline', title: 'Vardiya saatlerin', subtitle: 'Vardiya düzenini ve başlangıç/bitiş saatlerini belirle.' },
  currentShift: { icon: 'swap-horizontal-outline', title: 'Bu hafta hangi vardiyadasın?', subtitle: 'Döngünü doğru hizalamak için bu haftaki vardiyını seç.' },
  startDate: { icon: 'briefcase-outline', title: 'İşe başlama tarihin', subtitle: 'Yıllık izin hesabında kullanılır. Boş bırakabilirsin.' },
  summary: { icon: 'checkmark-circle-outline', title: 'Özet', subtitle: 'Bilgilerin doğru mu? Son bir göz at.' },
};

const WORK_SCHEDULE_OPTIONS: { value: WorkSchedule; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'MON_FRI', label: 'Pazartesi – Cuma', icon: 'business-outline' },
  { value: 'MON_SAT', label: 'Pazartesi – Cumartesi', icon: 'storefront-outline' },
  { value: 'EVERY_DAY', label: 'Her gün', icon: 'infinite-outline' },
];

const SHIFT_PATTERN_OPTIONS: { value: ShiftPattern; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'FIXED_DAY', label: 'Sabit gündüz', icon: 'sunny-outline' },
  { value: 'FIXED_NIGHT', label: 'Sabit gece', icon: 'moon-outline' },
  { value: 'TWO_SHIFT', label: '2 vardiya', icon: 'swap-vertical-outline' },
  { value: 'THREE_SHIFT', label: '3 vardiya', icon: 'repeat-outline' },
];

const SALARY_TYPE_OPTIONS: { value: SalaryType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'GROSS', label: 'Brüt', icon: 'trending-up-outline' },
  { value: 'NET', label: 'Net', icon: 'cash-outline' },
];

const BES_RATE_OPTIONS: { value: string; label: string }[] = [
  { value: '300', label: '%3 (varsayılan)' },
  { value: '400', label: '%4' },
  { value: '500', label: '%5' },
  { value: '600', label: '%6' },
];

type TemplateDraft = { code: string; name: string; startLocalTime: string; endLocalTime: string };

type Draft = {
  salaryText: string;
  salaryType: SalaryType;
  payday: string;
  besEnabled: boolean;
  besRateBp: string;
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  templateDrafts: TemplateDraft[];
  currentShiftIndex: number;
  startDateText: string;
};

function defaultTemplateDrafts(ws: WorkSchedule, sp: ShiftPattern): TemplateDraft[] {
  return DEFAULT_SHIFT_HOURS[ws][sp].map((h) => ({ ...h }));
}

const INITIAL_DRAFT: Draft = {
  salaryText: '',
  salaryType: 'GROSS',
  payday: '1',
  besEnabled: false,
  besRateBp: '300',
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  templateDrafts: defaultTemplateDrafts('MON_FRI', 'FIXED_DAY'),
  currentShiftIndex: 0,
  startDateText: '',
};

function mondayOfThisWeek(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function needsCurrentShiftStep(pattern: ShiftPattern): boolean {
  return pattern === 'TWO_SHIFT' || pattern === 'THREE_SHIFT';
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

function getEffectiveSteps(draft: Draft): StepId[] {
  if (needsCurrentShiftStep(draft.shiftPattern)) return [...STEPS];
  return STEPS.filter((s) => s !== 'currentShift');
}

export default function SetupScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSteps = useMemo(() => getEffectiveSteps(draft), [draft.shiftPattern]);
  const currentStep = effectiveSteps[step]!;
  const meta = STEP_META[currentStep];
  const isFirst = step === 0;
  const isLast = step === effectiveSteps.length - 1;

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'salary': {
        try {
          if (parseTryMinor(draft.salaryText) <= 0) return false;
        } catch { return false; }
        const n = Number(draft.payday);
        return draft.payday === 'LAST' || (Number.isInteger(n) && n >= 1 && n <= 31);
      }
      case 'shiftHours':
        return draft.templateDrafts.every((t) => isValidTime(t.startLocalTime) && isValidTime(t.endLocalTime) && t.startLocalTime !== t.endLocalTime);
      default: return true;
    }
  }, [currentStep, draft]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const salaryMinor = parseTryMinor(draft.salaryText);
      const startDate = draft.startDateText.trim() || null;
      let parsedStart: string | null = null;
      if (startDate) {
        const parts = startDate.split('.');
        if (parts.length === 3) {
          parsedStart = `${parts[2]}-${parts[1]!.padStart(2, '0')}-${parts[0]!.padStart(2, '0')}`;
        }
      }

      await updateSettings(database, {
        salaryMinor,
        salaryType: draft.salaryType,
        payday: draft.payday,
        workSchedule: draft.workSchedule,
        shiftPattern: draft.shiftPattern,
        besEnabled: draft.besEnabled,
        besRateBp: Number(draft.besRateBp),
        startDate: parsedStart,
      });

      const templateIds = draft.templateDrafts.map(() => randomUUID());
      const templates: ShiftTemplate[] = draft.templateDrafts.map((td, i) => ({
        id: templateIds[i]!,
        code: td.code,
        name: td.name,
        startLocalTime: td.startLocalTime,
        endLocalTime: td.endLocalTime,
        standardMinutes: shiftNominalMinutes(td.startLocalTime, td.endLocalTime),
      }));

      const entries = buildCycleEntries(draft.workSchedule, draft.shiftPattern, templateIds);
      const anchor = mondayOfThisWeek();
      const startIndex = needsCurrentShiftStep(draft.shiftPattern) ? draft.currentShiftIndex * 7 : 0;

      const cycle: ShiftCycle = {
        id: randomUUID(),
        name: 'Vardiya düzenim',
        timezone: 'Europe/Istanbul',
        anchorLocalDate: anchor,
        startIndex: startIndex % entries.length,
        entries,
      };

      await saveShiftSchedule(database, templates, cycle, anchor);
      await markSetupCompleted(database);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }, [database, draft, router]);

  const handleNext = useCallback(() => {
    if (isLast) {
      void handleFinish();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, handleFinish]);

  const handleBack = useCallback(() => {
    if (!isFirst) setStep((s) => s - 1);
  }, [isFirst]);

  const updateWorkSchedule = useCallback((ws: WorkSchedule) => {
    setDraft((d) => ({
      ...d,
      workSchedule: ws,
      templateDrafts: defaultTemplateDrafts(ws, d.shiftPattern),
      currentShiftIndex: 0,
    }));
  }, []);

  const updateShiftPattern = useCallback((sp: ShiftPattern) => {
    setDraft((d) => ({
      ...d,
      shiftPattern: sp,
      templateDrafts: defaultTemplateDrafts(d.workSchedule, sp),
      currentShiftIndex: 0,
    }));
  }, []);

  const updateTemplateTime = useCallback((index: number, field: 'startLocalTime' | 'endLocalTime', value: string) => {
    setDraft((d) => {
      const updated = [...d.templateDrafts];
      updated[index] = { ...updated[index]!, [field]: value };
      return { ...d, templateDrafts: updated };
    });
  }, []);

  const overtimeWarnings = useMemo(() => {
    const dailyStd = DAILY_STANDARD_BY_SCHEDULE[draft.workSchedule];
    return draft.templateDrafts.map((t) => {
      if (!isValidTime(t.startLocalTime) || !isValidTime(t.endLocalTime) || t.startLocalTime === t.endLocalTime) return null;
      const nominal = shiftNominalMinutes(t.startLocalTime, t.endLocalTime);
      const delta = nominal - dailyStd;
      if (delta <= 0) return null;
      const hours = Math.floor(delta / 60);
      const mins = delta % 60;
      return mins > 0 ? `+${hours} saat ${mins} dk/gün` : `+${hours} saat/gün`;
    });
  }, [draft.templateDrafts, draft.workSchedule]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepIconCircle, { backgroundColor: theme.accentSurface }]}>
          <Ionicons accessible={false} name={meta.icon} size={22} color={theme.accent} />
        </View>
        <Text style={[styles.stepLabel, { color: theme.accent }]}>
          ADIM {step + 1}/{effectiveSteps.length}
        </Text>
        <View style={styles.dots}>
          {effectiveSteps.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? theme.accent : theme.border }]} />
          ))}
        </View>
      </View>

      <Screen contentStyle={styles.scrollContent}>
        <PageHeading eyebrow={`ADIM ${step + 1}`} title={meta.title} subtitle={meta.subtitle} />

        {currentStep === 'salary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="cash-outline" title="Aylık maaş" />
              <TextInput
                style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={draft.salaryText}
                onChangeText={(t) => setDraft((d) => ({ ...d, salaryText: t }))}
                placeholder="Örn: 22.500"
                placeholderTextColor={theme.muted}
                keyboardType="decimal-pad"
                accessibilityLabel="Maaş tutarı"
              />
            </Card>
            <Card>
              <CardHeader icon="pricetag-outline" title="Brüt mü, net mi?" />
              <ChoiceGroup options={SALARY_TYPE_OPTIONS} selected={draft.salaryType} onSelect={(v) => setDraft((d) => ({ ...d, salaryType: v }))} />
            </Card>
            <Card>
              <CardHeader icon="calendar-number-outline" title="Maaş günü" />
              <TextInput
                style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={draft.payday}
                onChangeText={(t) => {
                  const upper = t.toUpperCase().trim();
                  if (upper === 'S' || upper === 'SO' || upper === 'SON') {
                    setDraft((d) => ({ ...d, payday: upper === 'SON' ? 'LAST' : upper }));
                  } else {
                    setDraft((d) => ({ ...d, payday: t.replace(/[^0-9]/g, '') }));
                  }
                }}
                placeholder="Örn: 15 veya SON"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                accessibilityLabel="Maaş günü"
              />
            </Card>
            <Card>
              <CardHeader icon="shield-checkmark-outline" title="BES kesintisi" />
              <ChoiceGroup
                options={[
                  { value: 'no' as const, label: 'Hayır', icon: 'close-circle-outline' as const },
                  { value: 'yes' as const, label: 'Evet', icon: 'checkmark-circle-outline' as const },
                ]}
                selected={draft.besEnabled ? 'yes' : 'no'}
                onSelect={(v) => setDraft((d) => ({ ...d, besEnabled: v === 'yes' }))}
              />
              {draft.besEnabled && (
                <ChoiceGroup options={BES_RATE_OPTIONS} selected={draft.besRateBp} onSelect={(v: string) => setDraft((d) => ({ ...d, besRateBp: v }))} />
              )}
            </Card>
          </View>
        )}

        {currentStep === 'workSchedule' && (
          <View style={styles.stepBody}>
            <ChoiceGroup options={WORK_SCHEDULE_OPTIONS} selected={draft.workSchedule} onSelect={updateWorkSchedule} />
          </View>
        )}

        {currentStep === 'shiftHours' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="git-compare-outline" title="Vardiya düzeni" />
              <ChoiceGroup options={SHIFT_PATTERN_OPTIONS} selected={draft.shiftPattern} onSelect={updateShiftPattern} />
            </Card>
            {draft.templateDrafts.map((td, i) => (
              <Card key={i}>
                <CardHeader icon="time-outline" title={td.name} />
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
                  <Ionicons name="arrow-forward" size={16} color={theme.muted} />
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
                  <View style={[styles.warningBadge, { backgroundColor: theme.warningSurface }]}>
                    <Ionicons name="alert-circle" size={14} color={theme.warning} />
                    <Text style={{ color: theme.warning, fontSize: layout.type.caption, fontWeight: '600' }}>{overtimeWarnings[i]}</Text>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}

        {currentStep === 'currentShift' && (
          <View style={styles.stepBody}>
            <ChoiceGroup
              options={draft.templateDrafts.map((td, i) => ({
                value: String(i),
                label: td.name,
                description: `${td.startLocalTime} – ${td.endLocalTime}`,
                icon: 'time-outline' as const,
              }))}
              selected={String(draft.currentShiftIndex)}
              onSelect={(v) => setDraft((d) => ({ ...d, currentShiftIndex: Number(v) }))}
            />
          </View>
        )}

        {currentStep === 'startDate' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="briefcase-outline" title="İşe başlama tarihi" />
              <TextInput
                style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={draft.startDateText}
                onChangeText={(t) => setDraft((d) => ({ ...d, startDateText: t }))}
                placeholder="GG.AA.YYYY"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                accessibilityLabel="İşe başlama tarihi"
              />
            </Card>
          </View>
        )}

        {currentStep === 'summary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="receipt-outline" title="Bilgilerin" />
              <SummaryRow label="Maaş" value={draft.salaryText ? `${formatTryMinor(parseTryMinor(draft.salaryText))} (${draft.salaryType === 'GROSS' ? 'Brüt' : 'Net'})` : '—'} theme={theme} />
              <SummaryRow label="Maaş günü" value={draft.payday === 'LAST' ? 'Ayın son günü' : `Ayın ${draft.payday}'i`} theme={theme} />
              <SummaryRow label="BES" value={draft.besEnabled ? `Evet (%${Number(draft.besRateBp) / 100})` : 'Hayır'} theme={theme} />
              <SummaryRow label="Çalışma düzeni" value={WORK_SCHEDULE_OPTIONS.find((o) => o.value === draft.workSchedule)?.label ?? ''} theme={theme} />
              <SummaryRow label="Vardiya düzeni" value={SHIFT_PATTERN_OPTIONS.find((o) => o.value === draft.shiftPattern)?.label ?? ''} theme={theme} />
              {draft.templateDrafts.map((td, i) => (
                <SummaryRow key={i} label={td.name} value={`${td.startLocalTime} – ${td.endLocalTime}`} theme={theme} />
              ))}
              {draft.startDateText ? <SummaryRow label="İşe başlama" value={draft.startDateText} theme={theme} /> : null}
            </Card>
          </View>
        )}

        {error && (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text>
        )}
      </Screen>

      <View style={styles.buttons}>
        {!isFirst && (
          <ActionButton label="Geri" onPress={handleBack} variant="secondary" icon="chevron-back" />
        )}
        <View style={{ flex: 1 }}>
          <ActionButton
            label={saving ? 'Kaydediliyor…' : isLast ? 'Tamamla' : 'İleri'}
            onPress={handleNext}
            disabled={!canAdvance() || saving}
            icon={isLast ? 'checkmark' : 'chevron-forward'}
            loading={saving}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value, theme }: { label: string; value: string; theme: Record<string, string> }) {
  return (
    <View style={styles.summaryRow} accessibilityLabel={`${label}: ${value}`}>
      <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{label}</Text>
      <Text style={{ color: theme.foreground, fontSize: layout.type.body, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepIndicator: { alignItems: 'center', paddingTop: 56, paddingBottom: 8, gap: 8 },
  stepIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: layout.type.caption, fontWeight: '900', letterSpacing: 1.5 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scrollContent: { paddingBottom: 16, gap: layout.space.md },
  stepBody: { gap: layout.space.md },
  input: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 16, paddingVertical: 14, fontSize: layout.type.section, minHeight: layout.control.minHeight },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: layout.type.body, flex: 1, textAlign: 'center', minHeight: layout.control.minHeight },
  warningBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  buttons: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingTop: 12, paddingBottom: layout.screen.bottom },
  error: { marginTop: 4, textAlign: 'center', fontSize: layout.type.caption },
});
