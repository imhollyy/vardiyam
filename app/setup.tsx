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

type StepId = 'salary' | 'salaryType' | 'payday' | 'bes' | 'schedule' | 'currentShift' | 'hourlyLeave' | 'summary';

const BES_RATE_OPTIONS: { value: string; label: string }[] = [
  { value: '300', label: '%3 (varsayılan)' },
  { value: '400', label: '%4' },
  { value: '500', label: '%5' },
  { value: '600', label: '%6' },
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
  salaryType: 'NET',
  payday: PAYDAY_LAST,
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

const STEP_META: Record<StepId, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  skippable?: boolean;
  skipLabel?: string;
}> = {
  salary:       { icon: 'cash-outline',            title: 'Aylik maasın ne kadar?',       subtitle: 'Brut veya net ucretini gir.' },
  salaryType:   { icon: 'pricetag-outline',         title: 'Brut mu, net mi?',             subtitle: 'Girdigin ucret brut mu net mi?',                   skippable: true, skipLabel: 'Net (varsayilan)' },
  payday:       { icon: 'calendar-number-outline',  title: 'Maas gunun hangisi?',           subtitle: 'Ayin hangi gunu maas aliyorsun?',                  skippable: true, skipLabel: 'Ayin son gunu' },
  bes:          { icon: 'shield-checkmark-outline', title: 'BES kesintisi var mi?',         subtitle: 'Bireysel emeklilik kesintisi uygulanıyor mu?',      skippable: true, skipLabel: 'Yok' },
  schedule:     { icon: 'time-outline',             title: 'Calisma duzenin',              subtitle: 'Vardiya duzeni ve saatlerini belirle.' },
  currentShift: { icon: 'swap-horizontal-outline',  title: 'Şu an hangi vardiyadasın?',    subtitle: 'Bu hafta hangi vardiyada çalışıyorsun?' },
  hourlyLeave:  { icon: 'hourglass-outline',        title: 'Saatlik izin kurali',           subtitle: 'Saatlik izin aldiginda ne yapilsın?',              skippable: true, skipLabel: 'Maasimdan kesilsin' },
  summary:      { icon: 'checkmark-circle-outline', title: 'Hazir!',                       subtitle: 'Bilgilerin dogru mu? Son bir goz at.' },
};

export default function SetupScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [salary, setSalary] = useState<SalaryDraft>(INITIAL_SALARY);
  const [schedule, setSchedule] = useState<ScheduleEditorValue>(INITIAL_SCHEDULE);
  const [hourlyLeavePolicy, setHourlyLeavePolicy] = useState<HourlyLeavePolicy>(HOURLY_LEAVE_POLICY.BASE_PAY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo((): StepId[] => {
    const list: StepId[] = ['salary', 'salaryType', 'payday', 'bes', 'schedule'];
    if (schedule.shiftPattern === 'TWO_SHIFT' || schedule.shiftPattern === 'THREE_SHIFT') {
      list.push('currentShift');
    }
    list.push('hourlyLeave', 'summary');
    return list;
  }, [schedule.shiftPattern]);

  const currentStep = steps[step]!;
  const meta = STEP_META[currentStep];
  const dayPalette = shiftPalette.day[mode];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progress = (step + 1) / steps.length;

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'salary': {
        try {
          if (parseTryMinor(salary.salaryText) <= 0) return false;
        } catch { return false; }
        return true;
      }
      case 'schedule':
        return isScheduleValueValid(schedule);
      default: return true;
    }
  }, [currentStep, salary.salaryText, schedule]);

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

  const handleSkip = useCallback(() => {
    switch (currentStep) {
      case 'salaryType':
        setSalary((s) => ({ ...s, salaryType: 'NET' }));
        break;
      case 'payday':
        setSalary((s) => ({ ...s, payday: PAYDAY_LAST }));
        break;
      case 'bes':
        setSalary((s) => ({ ...s, besEnabled: false }));
        break;
      case 'hourlyLeave':
        setHourlyLeavePolicy(HOURLY_LEAVE_POLICY.BASE_PAY);
        break;
      default: break;
    }
    setStep((s) => s + 1);
  }, [currentStep]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Linear progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as `${number}%`, backgroundColor: theme.accent }]} />
      </View>

      {/* Back / Skip row */}
      <View style={styles.headerRow}>
        {!isFirst ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Geri"
            onPress={handleBack}
            style={styles.navBtn}
          >
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
        ) : <View style={styles.navBtn} />}
        {meta.skippable && !isLast ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Atla: ${meta.skipLabel ?? 'Şimdi değil'}`}
            onPress={handleSkip}
            style={[styles.navBtn, styles.skipBtnInner]}
          >
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted }}>Atla</Text>
          </Pressable>
        ) : <View style={styles.navBtn} />}
      </View>

      <Screen contentStyle={styles.scrollContent}>
        <View style={[styles.stepIconCircle, { backgroundColor: theme.surfaceMuted }]}>
          <Ionicons accessible={false} name={meta.icon} size={22} color={theme.ink} />
        </View>
        <PageHeading eyebrow={`${step + 1} / ${steps.length}`} title={meta.title} subtitle={meta.subtitle} />

        {currentStep === 'salary' && (
          <Card>
            <MoneyField
              label="Aylik maas (TL)"
              value={salary.salaryText}
              onChangeText={(v) => setSalary((s) => ({ ...s, salaryText: v }))}
              placeholder="Orn: 22.500"
              autoFocus
            />
          </Card>
        )}

        {currentStep === 'salaryType' && (
          <Card>
            <ChoiceGroup
              options={[
                { value: 'NET' as SalaryType, label: 'Net', icon: 'cash-outline' as const },
                { value: 'GROSS' as SalaryType, label: 'Brut', icon: 'trending-up-outline' as const },
              ]}
              selected={salary.salaryType}
              onSelect={(v) => setSalary((s) => ({ ...s, salaryType: v }))}
            />
          </Card>
        )}

        {currentStep === 'payday' && (
          <Card>
            <View style={styles.paydayGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const val = String(day);
                const sel = salary.payday === val;
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={`Ayin ${day}. gunu`}
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
              accessibilityLabel="Ayin son gunu"
              accessibilityState={{ selected: salary.payday === PAYDAY_LAST }}
              onPress={() => setSalary((s) => ({ ...s, payday: PAYDAY_LAST }))}
              style={[styles.lastDayBtn, {
                backgroundColor: salary.payday === PAYDAY_LAST ? dayPalette.background : theme.surface,
                borderColor: salary.payday === PAYDAY_LAST ? theme.ink : theme.border,
                borderWidth: salary.payday === PAYDAY_LAST ? 2 : 1,
              }]}
            >
              <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: salary.payday === PAYDAY_LAST ? dayPalette.text : theme.ink }}>Ayin son gunu</Text>
            </Pressable>
          </Card>
        )}

        {currentStep === 'bes' && (
          <Card>
            <ChoiceGroup
              options={[
                { value: 'no' as const, label: 'Hayir', icon: 'close-circle-outline' as const },
                { value: 'yes' as const, label: 'Evet', icon: 'checkmark-circle-outline' as const },
              ]}
              selected={salary.besEnabled ? 'yes' : 'no'}
              onSelect={(v) => setSalary((s) => ({ ...s, besEnabled: v === 'yes' }))}
            />
            {salary.besEnabled && (
              <>
                <CardHeader icon="settings-outline" title="BES orani" />
                <ChoiceGroup
                  options={BES_RATE_OPTIONS}
                  selected={salary.besRateBp}
                  onSelect={(v: string) => setSalary((s) => ({ ...s, besRateBp: v }))}
                />
              </>
            )}
          </Card>
        )}

        {currentStep === 'schedule' && (
          <ScheduleEditor value={schedule} onChange={setSchedule} showCurrentShift={false} />
        )}

        {currentStep === 'currentShift' && (
          <Card>
            <View style={{ gap: 10 }}>
              {schedule.templateDrafts.map((td, i) => {
                const sel = schedule.currentShiftIndex === i;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${td.name}: ${td.startLocalTime} – ${td.endLocalTime}`}
                    onPress={() => setSchedule((s) => ({ ...s, currentShiftIndex: i }))}
                    style={[styles.shiftOption, {
                      borderWidth: sel ? 2 : StyleSheet.hairlineWidth,
                      borderColor: sel ? theme.ink : theme.border,
                      backgroundColor: sel ? theme.surfaceMuted : theme.surface,
                    }]}
                  >
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={20} color={sel ? theme.ink : theme.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{td.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>{td.startLocalTime} – {td.endLocalTime}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {currentStep === 'hourlyLeave' && (
          <Card>
            <HourlyLeavePolicySelector value={hourlyLeavePolicy} onChange={setHourlyLeavePolicy} theme={theme} />
          </Card>
        )}

        {currentStep === 'summary' && (
          <View style={styles.stepBody}>
            <Card>
              <CardHeader icon="receipt-outline" title="Bilgilerin" />
              <SummaryRow label="Maas" value={`${salary.salaryText} TL (${salary.salaryType === 'GROSS' ? 'Brut' : 'Net'})`} theme={theme} />
              <SummaryRow label="Maas gunu" value={salary.payday === PAYDAY_LAST ? 'Ayin son gunu' : `Ayin ${salary.payday}. gunu`} theme={theme} />
              <SummaryRow label="BES" value={salary.besEnabled ? `Evet (%${Number(salary.besRateBp) / 100})` : 'Hayir'} theme={theme} />
              <SummaryRow label="Calisma duzeni" value={WORK_SCHEDULE_LABEL[schedule.workSchedule] ?? ''} theme={theme} />
              <SummaryRow label="Vardiya duzeni" value={SHIFT_PATTERN_LABEL[schedule.shiftPattern] ?? ''} theme={theme} />
              {schedule.templateDrafts.map((td, i) => (
                <SummaryRow key={i} label={td.name} value={`${td.startLocalTime} – ${td.endLocalTime}`} theme={theme} />
              ))}
              <SummaryRow
                label="Saatlik izin"
                value={hourlyLeavePolicy === HOURLY_LEAVE_POLICY.OVERTIME_FIRST ? 'Once mesaiden dusulsun' : 'Maasimdan kesilsin'}
                theme={theme}
              />
            </Card>
            <Text style={[styles.hint, { color: theme.muted }]}>
              {'Ise baslama tarihinizi daha sonra Ayarlar\'dan ekleyebilirsiniz.'}
            </Text>
          </View>
        )}

        {error && (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text>
        )}
      </Screen>

      <View style={styles.buttons}>
        <ActionButton
          label={saving ? 'Kaydediliyor...' : isLast ? 'Başla' : 'İleri'}
          onPress={handleNext}
          disabled={!canAdvance() || saving}
          icon={isLast ? 'checkmark' : 'chevron-forward'}
          loading={saving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const HOURLY_LEAVE_OPTIONS: { value: HourlyLeavePolicy; title: string; description: string }[] = [
  {
    value: HOURLY_LEAVE_POLICY.BASE_PAY,
    title: 'Maasimdan kesilsin',
    description: 'Mesain etkilenmez, izin saatin maasından kesilir.',
  },
  {
    value: HOURLY_LEAVE_POLICY.OVERTIME_FIRST,
    title: 'Once mesaimden dusulsun',
    description: 'Mesain varsa izin saatin oradan dusulur, yetmezse maasından kesilir.',
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
  progressTrack: { height: 3, marginTop: 56, marginHorizontal: 0 },
  progressFill: { height: 3, borderRadius: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screen.horizontal, paddingTop: 8 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  skipBtnInner: { width: 'auto', paddingHorizontal: 8 },
  stepIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 16, gap: layout.space.md },
  stepBody: { gap: layout.space.md },
  paydayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  paydayCell: { width: `${100 / 7}%` as `${number}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  lastDayBtn: { borderRadius: layout.radius.control, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2 },
  shiftOption: { borderRadius: layout.radius.control, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  buttons: { paddingHorizontal: layout.screen.horizontal, paddingTop: 12, paddingBottom: layout.screen.bottom },
  error: { marginTop: 4, textAlign: 'center', fontSize: layout.type.caption },
  hint: { fontSize: layout.type.caption, textAlign: 'center', lineHeight: 18 },
});
