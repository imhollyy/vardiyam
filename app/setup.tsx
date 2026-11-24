import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { markSetupCompleted, updateSettings } from '@/src/data/settingsRepository';
import { saveShiftSchedule } from '@/src/data/shiftCycleRepository';
import type { SalaryType, HourlyLeavePolicy } from '@/src/domain/payroll/types';
import { PAYDAY_LAST, HOURLY_LEAVE_POLICY } from '@/src/domain/payroll/types';
import { buildSetupPayload } from '@/src/features/setup/buildSetupPayload';
import {
  ScheduleEditor,
  defaultScheduleEditorDrafts,
  isScheduleValueValid,
  type ScheduleEditorValue,
} from '@/src/components/schedule/ScheduleEditor';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { parseTryMinor } from '@/src/domain/money';
import { Screen } from '@/src/components/ui/Screen';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { MoneyField } from '@/src/components/ui/MoneyField';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { ProgressDots } from '@/src/components/ui/ProgressDots';
import { BottomSheet } from '@/src/components/ui/BottomSheet';

const STEPS = ['salary', 'schedule', 'summary'] as const;
type StepId = (typeof STEPS)[number];

const STEP_META: Record<StepId, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string }> = {
  salary: { icon: 'wallet-outline', title: 'Maaş bilgilerin', subtitle: 'Aylık ücret ve maaş gününü gir.' },
  schedule: { icon: 'time-outline', title: 'Çalışma düzenin', subtitle: 'Vardiya düzeni ve saatlerini belirle.' },
  summary: { icon: 'checkmark-circle-outline', title: 'Hazır!', subtitle: 'Bilgilerin doğru mu? Son bir göz at.' },
};

const BES_RATE_OPTIONS: { value: string; label: string }[] = [
  { value: '300', label: '%3 (varsayılan)' },
  { value: '400', label: '%4' },
  { value: '500', label: '%5' },
  { value: '600', label: '%6' },
];

const SALARY_TYPE_OPTIONS: { value: SalaryType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'GROSS', label: 'Brüt', icon: 'trending-up-outline' },
  { value: 'NET', label: 'Net', icon: 'cash-outline' },
];

type SalaryDraft = {
  salaryText: string;
  salaryType: SalaryType;
  payday: string;
  besEnabled: boolean;
  besRateBp: string;
};

const INITIAL_SALARY: SalaryDraft = {
  salaryText: '',
  salaryType: 'GROSS',
  payday: '1',
  besEnabled: false,
  besRateBp: '300',
};

const INITIAL_SCHEDULE: ScheduleEditorValue = {
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  templateDrafts: defaultScheduleEditorDrafts('MON_FRI', 'FIXED_DAY'),
  currentShiftIndex: 0,
};

const WORK_SCHEDULE_LABEL: Record<string, string> = {
  MON_FRI: 'Pazartesi – Cuma',
  MON_SAT: 'Pazartesi – Cumartesi',
  EVERY_DAY: 'Her gün',
};

const SHIFT_PATTERN_LABEL: Record<string, string> = {
  FIXED_DAY: 'Sabit gündüz',
  FIXED_NIGHT: 'Sabit gece',
  TWO_SHIFT: '2 vardiya',
  THREE_SHIFT: '3 vardiya',
};

export default function SetupScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [salary, setSalary] = useState<SalaryDraft>(INITIAL_SALARY);
  const [schedule, setSchedule] = useState<ScheduleEditorValue>(INITIAL_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBesSheet, setShowBesSheet] = useState(false);
  const [hourlyLeavePolicy, setHourlyLeavePolicy] = useState<HourlyLeavePolicy>(HOURLY_LEAVE_POLICY.BASE_PAY);

  const currentStep = STEPS[step]!;
  const meta = STEP_META[currentStep];
  const dayPalette = shiftPalette.day[mode];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'salary': {
        try {
          if (parseTryMinor(salary.salaryText) <= 0) return false;
        } catch { return false; }
        const n = Number(salary.payday);
        return salary.payday === PAYDAY_LAST || (Number.isInteger(n) && n >= 1 && n <= 31);
      }
      case 'schedule':
        return isScheduleValueValid(schedule);
      default: return true;
    }
  }, [currentStep, salary, schedule]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const templateIds = schedule.templateDrafts.map(() => randomUUID());
      const payload = buildSetupPayload(
        {
          salaryText: salary.salaryText,
          salaryType: salary.salaryType,
          payday: salary.payday,
          besEnabled: salary.besEnabled,
          besRateBp: salary.besRateBp,
          workSchedule: schedule.workSchedule,
          shiftPattern: schedule.shiftPattern,
          templateDrafts: schedule.templateDrafts,
          currentShiftIndex: schedule.currentShiftIndex,
          startDate: '',
        },
        templateIds,
        randomUUID(),
        todayStr,
      );
      await updateSettings(database, {
        salaryMinor: payload.salaryMinor,
        salaryType: payload.salaryType,
        payday: payload.payday,
        workSchedule: payload.workSchedule,
        shiftPattern: payload.shiftPattern,
        besEnabled: payload.besEnabled,
        besRateBp: payload.besRateBp,
        startDate: null,
        hourlyLeavePolicy,
      });
      await saveShiftSchedule(database, payload.templates, payload.cycle, payload.effectiveFrom);
      await markSetupCompleted(database);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }, [database, salary, schedule, router, hourlyLeavePolicy]);

  const handleNext = useCallback(() => {
    if (isLast) { void handleFinish(); }
    else { setStep((s) => s + 1); }
  }, [isLast, handleFinish]);

  const handleBack = useCallback(() => {
    if (!isFirst) setStep((s) => s - 1);
  }, [isFirst]);

  const besLabel = useMemo(() => {
    const typeLabel = salary.salaryType === 'GROSS' ? 'Brüt' : 'Net';
    const besStr = salary.besEnabled ? `, BES %${Number(salary.besRateBp) / 100}` : ', BES Kapalı';
    return `${typeLabel}${besStr}`;
  }, [salary.salaryType, salary.besEnabled, salary.besRateBp]);

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
        <ProgressDots total={STEPS.length} current={step + 1} />
      </View>

      <Screen contentStyle={styles.scrollContent}>
        <PageHeading eyebrow={`ADIM ${step + 1}`} title={meta.title} subtitle={meta.subtitle} />

        {currentStep === 'salary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="cash-outline" title="Aylık maaş" />
              <MoneyField
                label="Aylık maaş (TL)"
                value={salary.salaryText}
                onChangeText={(v) => setSalary((s) => ({ ...s, salaryText: v }))}
                placeholder="Örn: 22.500"
                autoFocus
              />
              {/* Brüt/BES row */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Maaş türü ve BES ayarları"
                onPress={() => setShowBesSheet(true)}
                style={[styles.besRow, { borderColor: theme.border }]}
              >
                <View style={styles.besRowLeft}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={theme.muted} />
                  <Text style={{ color: theme.muted, fontSize: layout.type.body }}>Brüt / BES</Text>
                </View>
                <View style={styles.besRowRight}>
                  <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{besLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                </View>
              </Pressable>
            </Card>

            <Card>
              <CardHeader icon="calendar-number-outline" title="Maaş günü" />
              <View style={styles.paydayGrid}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const val = String(day);
                  const sel = salary.payday === val;
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`Ayın ${day}. günü`}
                      accessibilityState={{ selected: sel }}
                      onPress={() => setSalary((s) => ({ ...s, payday: val }))}
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
                accessibilityState={{ selected: salary.payday === PAYDAY_LAST }}
                onPress={() => setSalary((s) => ({ ...s, payday: PAYDAY_LAST }))}
                style={[styles.lastDayBtn, {
                  backgroundColor: salary.payday === PAYDAY_LAST ? dayPalette.background : theme.surface,
                  borderColor: salary.payday === PAYDAY_LAST ? theme.ink : theme.border,
                  borderWidth: salary.payday === PAYDAY_LAST ? 2 : 1,
                }]}
              >
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: salary.payday === PAYDAY_LAST ? dayPalette.text : theme.ink }}>Ayın son günü</Text>
              </Pressable>
            </Card>
          </View>
        )}

        {currentStep === 'schedule' && (
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        )}

        {currentStep === 'summary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="receipt-outline" title="Bilgilerin" />
              <SummaryRow label="Maaş" value={`${salary.salaryText} TL (${salary.salaryType === 'GROSS' ? 'Brüt' : 'Net'})`} theme={theme} />
              <SummaryRow label="Maaş günü" value={salary.payday === PAYDAY_LAST ? 'Ayın son günü' : `Ayın ${salary.payday}'i`} theme={theme} />
              <SummaryRow label="BES" value={salary.besEnabled ? `Evet (%${Number(salary.besRateBp) / 100})` : 'Hayır'} theme={theme} />
              <SummaryRow label="Çalışma düzeni" value={WORK_SCHEDULE_LABEL[schedule.workSchedule] ?? ''} theme={theme} />
              <SummaryRow label="Vardiya düzeni" value={SHIFT_PATTERN_LABEL[schedule.shiftPattern] ?? ''} theme={theme} />
              {schedule.templateDrafts.map((td, i) => (
                <SummaryRow key={i} label={td.name} value={`${td.startLocalTime} – ${td.endLocalTime}`} theme={theme} />
              ))}
            </Card>
            <Card>
              <CardHeader icon="time-outline" title="Saatlik izin aldığında" />
              <HourlyLeavePolicySelector value={hourlyLeavePolicy} onChange={setHourlyLeavePolicy} theme={theme} />
              <Text style={[styles.hint, { color: theme.muted, marginTop: 8 }]}>
                {'Emin değilsen sonra Ayarlar\'dan değiştirebilirsin.'}
              </Text>
            </Card>
            <Text style={[styles.hint, { color: theme.muted }]}>
              {`İşe başlama tarihinizi daha sonra Ayarlar'dan ekleyebilirsiniz.`}
            </Text>
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
            label={saving ? 'Kaydediliyor…' : isLast ? 'Başla' : 'İleri'}
            onPress={handleNext}
            disabled={!canAdvance() || saving}
            icon={isLast ? 'checkmark' : 'chevron-forward'}
            loading={saving}
          />
        </View>
      </View>

      {/* Brüt/BES BottomSheet */}
      <BottomSheet visible={showBesSheet} onClose={() => setShowBesSheet(false)}>
        <Text style={[styles.sheetTitle, { color: theme.ink }]}>Maaş türü ve BES</Text>
        <CardHeader icon="pricetag-outline" title="Brüt mü, net mi?" />
        <ChoiceGroup
          options={SALARY_TYPE_OPTIONS}
          selected={salary.salaryType}
          onSelect={(v) => setSalary((s) => ({ ...s, salaryType: v }))}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <CardHeader icon="shield-checkmark-outline" title="BES kesintisi" />
        <ChoiceGroup
          options={[
            { value: 'no' as const, label: 'Hayır', icon: 'close-circle-outline' as const },
            { value: 'yes' as const, label: 'Evet', icon: 'checkmark-circle-outline' as const },
          ]}
          selected={salary.besEnabled ? 'yes' : 'no'}
          onSelect={(v) => setSalary((s) => ({ ...s, besEnabled: v === 'yes' }))}
        />
        {salary.besEnabled && (
          <ChoiceGroup
            options={BES_RATE_OPTIONS}
            selected={salary.besRateBp}
            onSelect={(v: string) => setSalary((s) => ({ ...s, besRateBp: v }))}
          />
        )}
        <ActionButton label="Tamam" onPress={() => setShowBesSheet(false)} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const HOURLY_LEAVE_OPTIONS: { value: HourlyLeavePolicy; title: string; description: string }[] = [
  {
    value: HOURLY_LEAVE_POLICY.BASE_PAY,
    title: 'Maaşımdan kesilsin',
    description: 'Mesain etkilenmez, izin saatin maaşından kesilir.',
  },
  {
    value: HOURLY_LEAVE_POLICY.OVERTIME_FIRST,
    title: 'Önce mesaimden düşülsün',
    description: 'Mesain varsa izin saatin oradan düşülür, yetmezse maaşından kesilir.',
  },
];

function HourlyLeavePolicySelector({
  value,
  onChange,
  theme,
}: {
  value: HourlyLeavePolicy;
  onChange: (v: HourlyLeavePolicy) => void;
  theme: Record<string, string>;
}) {
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      {HOURLY_LEAVE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.title}
            onPress={() => onChange(opt.value)}
            style={[
              hlpStyles.optionCard,
              {
                borderColor: selected ? theme.ink : theme.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                backgroundColor: selected ? theme.surfaceMuted : theme.surface,
              },
            ]}
          >
            <View style={hlpStyles.optionRow}>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? theme.ink : theme.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{opt.title}</Text>
                <Text style={{ color: theme.muted, fontSize: layout.type.caption, marginTop: 2 }}>{opt.description}</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const hlpStyles = StyleSheet.create({
  optionCard: { borderRadius: layout.radius.control, padding: 12 },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});

function SummaryRow({ label, value, theme }: { label: string; value: string; theme: Record<string, string> }) {
  return (
    <View style={styles.summaryRow} accessibilityLabel={`${label}: ${value}`}>
      <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{label}</Text>
      <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepIndicator: { alignItems: 'center', paddingTop: 56, paddingBottom: 8, gap: 10 },
  stepIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 16, gap: layout.space.md },
  stepBody: { gap: layout.space.md },
  paydayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  paydayCell: { width: `${100 / 7}%` as `${number}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  lastDayBtn: { borderRadius: layout.radius.control, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2 },
  besRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    minHeight: layout.control.touchTarget,
  },
  besRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  besRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  buttons: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingTop: 12, paddingBottom: layout.screen.bottom },
  error: { marginTop: 4, textAlign: 'center', fontSize: layout.type.caption },
  hint: { fontSize: layout.type.caption, textAlign: 'center', lineHeight: 18 },
  sheetTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.section, marginBottom: 4 },
  divider: { height: 1, marginVertical: 4 },
});
