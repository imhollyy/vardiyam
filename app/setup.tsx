import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { markSetupCompleted, updateSettings } from '@/src/data/settingsRepository';
import { saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import type { SalaryType, WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import { PAYDAY_LAST } from '@/src/domain/payroll/types';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes, legalMinBreakMinutes } from '@/src/config/shifts';
import { buildSetupPayload } from '@/src/features/setup/buildSetupPayload';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { parseTryMinor, formatTryMinor } from '@/src/domain/money';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { ProgressDots } from '@/src/components/ui/ProgressDots';

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

type TemplateDraft = { code: string; name: string; startLocalTime: string; endLocalTime: string; breakMinutes: number };

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

const BREAK_OPTIONS: { label: string; value: number }[] = [
  { label: '15 dk', value: 15 },
  { label: '30 dk', value: 30 },
  { label: '45 dk', value: 45 },
  { label: '60 dk', value: 60 },
  { label: '90 dk', value: 90 },
];

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

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function needsCurrentShiftStep(pattern: ShiftPattern): boolean {
  return pattern === 'TWO_SHIFT' || pattern === 'THREE_SHIFT';
}

function getEffectiveSteps(draft: Draft): StepId[] {
  if (needsCurrentShiftStep(draft.shiftPattern)) return [...STEPS];
  return STEPS.filter((s) => s !== 'currentShift');
}

export default function SetupScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSteps = useMemo(() => getEffectiveSteps(draft), [draft]);
  const currentStep = effectiveSteps[step]!;
  const meta = STEP_META[currentStep];
  const dayPalette = shiftPalette.day[mode];
  const isFirst = step === 0;
  const isLast = step === effectiveSteps.length - 1;

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'salary': {
        try {
          if (parseTryMinor(draft.salaryText) <= 0) return false;
        } catch { return false; }
        const n = Number(draft.payday);
        return draft.payday === PAYDAY_LAST || (Number.isInteger(n) && n >= 1 && n <= 31);
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
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const templateIds = draft.templateDrafts.map(() => randomUUID());
      const payload = buildSetupPayload(draft, templateIds, randomUUID(), todayStr);
      await updateSettings(database, {
        salaryMinor: payload.salaryMinor,
        salaryType: payload.salaryType,
        payday: payload.payday,
        workSchedule: payload.workSchedule,
        shiftPattern: payload.shiftPattern,
        besEnabled: payload.besEnabled,
        besRateBp: payload.besRateBp,
        startDate: payload.startDate,
      });
      await saveShiftSchedule(database, payload.templates, payload.cycle, payload.effectiveFrom);
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
      const tpl = { ...updated[index]! };
      (tpl as Record<string, unknown>)[field] = value;
      // Auto-update legal minimum break when times change
      if (isValidTime(tpl.startLocalTime) && isValidTime(tpl.endLocalTime) && tpl.startLocalTime !== tpl.endLocalTime) {
        const nominal = shiftNominalMinutes(tpl.startLocalTime, tpl.endLocalTime);
        const legalMin = legalMinBreakMinutes(nominal);
        if (tpl.breakMinutes < legalMin) tpl.breakMinutes = legalMin;
      }
      updated[index] = tpl;
      return { ...d, templateDrafts: updated };
    });
  }, []);

  const updateTemplateBreak = useCallback((index: number, value: number) => {
    setDraft((d) => {
      const updated = [...d.templateDrafts];
      updated[index] = { ...updated[index]!, breakMinutes: value };
      return { ...d, templateDrafts: updated };
    });
  }, []);

  const weeklyNetPreview = useMemo(() => {
    const workDays = draft.workSchedule === 'MON_FRI' ? 5 : draft.workSchedule === 'MON_SAT' ? 6 : 7;
    if (draft.shiftPattern === 'FIXED_DAY' || draft.shiftPattern === 'FIXED_NIGHT') {
      const tpl = draft.templateDrafts[0];
      if (!tpl || !isValidTime(tpl.startLocalTime) || !isValidTime(tpl.endLocalTime)) return null;
      const net = shiftNominalMinutes(tpl.startLocalTime, tpl.endLocalTime) - tpl.breakMinutes;
      const weekly = net * workDays;
      const excess = Math.max(0, weekly - 2700);
      return { weeklyMinutes: weekly, excessMinutes: excess };
    }
    // For multi-shift patterns, use first template as reference
    const tpl = draft.templateDrafts[0];
    if (!tpl || !isValidTime(tpl.startLocalTime) || !isValidTime(tpl.endLocalTime)) return null;
    const net = shiftNominalMinutes(tpl.startLocalTime, tpl.endLocalTime) - tpl.breakMinutes;
    const weekly = net * workDays;
    const excess = Math.max(0, weekly - 2700);
    return { weeklyMinutes: weekly, excessMinutes: excess };
  }, [draft.templateDrafts, draft.workSchedule, draft.shiftPattern]);

  const breakWarnings = useMemo(() => {
    return draft.templateDrafts.map((t) => {
      if (!isValidTime(t.startLocalTime) || !isValidTime(t.endLocalTime) || t.startLocalTime === t.endLocalTime) return null;
      const nominal = shiftNominalMinutes(t.startLocalTime, t.endLocalTime);
      const legalMin = legalMinBreakMinutes(nominal);
      if (t.breakMinutes < legalMin) return `Yasal asgari mola ${legalMin} dk (bilgi amaçlı)`;
      return null;
    });
  }, [draft.templateDrafts]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepIconCircle, { backgroundColor: theme.surfaceMuted }]}>
          <Ionicons accessible={false} name={meta.icon} size={22} color={theme.ink} />
        </View>
        <ProgressDots total={effectiveSteps.length} current={step + 1} />
      </View>

      <Screen contentStyle={styles.scrollContent}>
        <PageHeading eyebrow={`ADIM ${step + 1}`} title={meta.title} subtitle={meta.subtitle} />

        {currentStep === 'salary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="cash-outline" title="Aylık maaş" />
              <TextInput
                style={[styles.input, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]}
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
              <View style={styles.paydayGrid}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const val = String(day);
                  const sel = draft.payday === val;
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`Ayın ${day}. günü`}
                      accessibilityState={{ selected: sel }}
                      onPress={() => setDraft((d) => ({ ...d, payday: val }))}
                      style={[styles.paydayCell, {
                        backgroundColor: sel ? dayPalette.background : theme.surface,
                        borderColor: sel ? theme.ink : theme.border,
                        borderWidth: sel ? 2 : 1,
                      }]}
                    >
                      <Text style={{ fontFamily: sel ? fonts.extraBold : fonts.regular, fontSize: 13, color: sel ? dayPalette.text : theme.ink }}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ayın son günü"
                accessibilityState={{ selected: draft.payday === PAYDAY_LAST }}
                onPress={() => setDraft((d) => ({ ...d, payday: PAYDAY_LAST }))}
                style={[styles.lastDayBtn, {
                  backgroundColor: draft.payday === PAYDAY_LAST ? dayPalette.background : theme.surface,
                  borderColor: draft.payday === PAYDAY_LAST ? theme.ink : theme.border,
                  borderWidth: draft.payday === PAYDAY_LAST ? 2 : 1,
                }]}
              >
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: draft.payday === PAYDAY_LAST ? dayPalette.text : theme.ink }}>Ayın son günü</Text>
              </Pressable>
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
                    style={[styles.timeInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]}
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
                    style={[styles.timeInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]}
                    value={td.endLocalTime}
                    onChangeText={(v) => updateTemplateTime(i, 'endLocalTime', v)}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    accessibilityLabel={`${td.name} bitiş saati`}
                    maxLength={5}
                  />
                </View>
                {/* Break selector */}
                <View style={[styles.breakRow, { borderTopColor: theme.border }]}>
                  <Text style={{ fontFamily: fonts.semiBold, color: theme.muted, fontSize: layout.type.caption }}>Mola</Text>
                  <View style={styles.breakOptions}>
                    {BREAK_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityLabel={`Mola ${opt.label}`}
                        onPress={() => updateTemplateBreak(i, opt.value)}
                        style={[styles.breakChip, {
                          backgroundColor: td.breakMinutes === opt.value ? theme.ink : theme.surface,
                          borderColor: td.breakMinutes === opt.value ? theme.ink : theme.border,
                        }]}
                      >
                        <Text style={{ fontFamily: fonts.semiBold, color: td.breakMinutes === opt.value ? theme.onInk : theme.ink, fontSize: 12 }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Text style={{ color: theme.muted, fontSize: layout.type.caption, paddingTop: 2 }}>
                  Örn. 30 dk yemek + 2×15 dk çay = 60 dk
                </Text>
                {breakWarnings[i] && (
                  <View style={[styles.warningBadge, { backgroundColor: theme.warningSurface, marginTop: 6 }]}>
                    <Ionicons name="information-circle" size={14} color={theme.warning} />
                    <Text style={{ color: theme.warning, fontSize: layout.type.caption }}>{breakWarnings[i]}</Text>
                  </View>
                )}
              </Card>
            ))}
            {weeklyNetPreview && (
              <View style={[styles.warningBadge, { backgroundColor: weeklyNetPreview.excessMinutes > 0 ? theme.warningSurface : theme.successSurface }]}>
                <Ionicons name={weeklyNetPreview.excessMinutes > 0 ? 'alert-circle' : 'checkmark-circle'} size={14} color={weeklyNetPreview.excessMinutes > 0 ? theme.warning : theme.success} />
                <Text style={{ fontFamily: fonts.semiBold, color: weeklyNetPreview.excessMinutes > 0 ? theme.warning : theme.success, fontSize: layout.type.caption, flex: 1 }}>
                  {weeklyNetPreview.excessMinutes > 0
                    ? `Haftalık net çalışman ${Math.round(weeklyNetPreview.weeklyMinutes / 60 * 10) / 10} saat; haftada ${Math.round(weeklyNetPreview.excessMinutes / 60 * 10) / 10} saat fazla mesai eklenecek.`
                    : `Haftalık net çalışman ${Math.round(weeklyNetPreview.weeklyMinutes / 60 * 10) / 10} saat; fazla mesai eklenmeyecek.`}
                </Text>
              </View>
            )}
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
                style={[styles.input, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface }]}
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
              <SummaryRow label="Maaş günü" value={draft.payday === PAYDAY_LAST ? 'Ayın son günü' : `Ayın ${draft.payday}'i`} theme={theme} />
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
      <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepIndicator: { alignItems: 'center', paddingTop: 56, paddingBottom: 8, gap: 10 },
  stepIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  paydayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  paydayCell: { width: `${100 / 7}%` as `${number}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  lastDayBtn: { borderRadius: layout.radius.control, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2 },
  scrollContent: { paddingBottom: 16, gap: layout.space.md },
  stepBody: { gap: layout.space.md },
  input: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 16, paddingVertical: 14, fontSize: layout.type.section, minHeight: layout.control.minHeight },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: layout.type.body, flex: 1, textAlign: 'center', minHeight: layout.control.minHeight },
  warningBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  breakOptions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  breakChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  buttons: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingTop: 12, paddingBottom: layout.screen.bottom },
  error: { marginTop: 4, textAlign: 'center', fontSize: layout.type.caption },
});
