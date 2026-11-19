import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { markSetupCompleted, updateSettings } from '@/src/data/settingsRepository';
import type { SalaryType, WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { parseTryMinor } from '@/src/domain/money';

const STEPS = [
  'salary',
  'salaryType',
  'payday',
  'workSchedule',
  'shiftPattern',
  'startDate',
] as const;

type StepId = (typeof STEPS)[number];

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

const SALARY_TYPE_OPTIONS: { value: SalaryType; label: string }[] = [
  { value: 'GROSS', label: 'Brüt' },
  { value: 'NET', label: 'Net' },
];

type Draft = {
  salaryText: string;
  salaryType: SalaryType;
  payday: string;
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  startDateText: string;
};

const INITIAL_DRAFT: Draft = {
  salaryText: '',
  salaryType: 'GROSS',
  payday: '1',
  workSchedule: 'MON_FRI',
  shiftPattern: 'FIXED_DAY',
  startDateText: '',
};

export default function SetupScreen() {
  const { theme } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[step]!;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'salary': {
        try { return parseTryMinor(draft.salaryText) > 0; } catch { return false; }
      }
      case 'payday': {
        const n = Number(draft.payday);
        return draft.payday === 'LAST' || (Number.isInteger(n) && n >= 1 && n <= 31);
      }
      case 'startDate': return true;
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
        startDate: parsedStart,
      });
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.progress}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i <= step ? theme.primaryAction : theme.border },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {currentStep === 'salary' && (
          <StepContainer title="Aylık maaşın ne kadar?" subtitle="Brüt veya net maaşını gir.">
            <TextInput
              style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
              value={draft.salaryText}
              onChangeText={(t) => setDraft((d) => ({ ...d, salaryText: t }))}
              placeholder="Örn: 22.500"
              placeholderTextColor={theme.muted}
              keyboardType="decimal-pad"
              accessibilityLabel="Maaş tutarı"
            />
          </StepContainer>
        )}

        {currentStep === 'salaryType' && (
          <StepContainer title="Bu tutar brüt mü, net mi?">
            <OptionGroup
              options={SALARY_TYPE_OPTIONS}
              value={draft.salaryType}
              onSelect={(v) => setDraft((d) => ({ ...d, salaryType: v }))}
              theme={theme}
            />
          </StepContainer>
        )}

        {currentStep === 'payday' && (
          <StepContainer title="Maaş günün ayın kaçı?" subtitle="Ayın son günüyse 'SON' yaz.">
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
              placeholder="Örn: 15"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              accessibilityLabel="Maaş günü"
            />
          </StepContainer>
        )}

        {currentStep === 'workSchedule' && (
          <StepContainer title="Çalışma düzenin ne?">
            <OptionGroup
              options={WORK_SCHEDULE_OPTIONS}
              value={draft.workSchedule}
              onSelect={(v) => setDraft((d) => ({ ...d, workSchedule: v }))}
              theme={theme}
            />
          </StepContainer>
        )}

        {currentStep === 'shiftPattern' && (
          <StepContainer title="Vardiya düzenin ne?">
            <OptionGroup
              options={SHIFT_PATTERN_OPTIONS}
              value={draft.shiftPattern}
              onSelect={(v) => setDraft((d) => ({ ...d, shiftPattern: v }))}
              theme={theme}
            />
          </StepContainer>
        )}

        {currentStep === 'startDate' && (
          <StepContainer title="İşe başlama tarihin" subtitle="Boş bırakabilirsin. Yıllık izin hesabında kullanılır.">
            <TextInput
              style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
              value={draft.startDateText}
              onChangeText={(t) => setDraft((d) => ({ ...d, startDateText: t }))}
              placeholder="GG.AA.YYYY"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              accessibilityLabel="İşe başlama tarihi"
            />
          </StepContainer>
        )}

        {error && (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text>
        )}
      </ScrollView>

      <View style={styles.buttons}>
        {!isFirst && (
          <Pressable
            accessibilityRole="button"
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: layout.type.body }}>Geri</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={!canAdvance() || saving}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.nextButton,
            { backgroundColor: canAdvance() ? theme.primaryAction : theme.border, opacity: pressed ? 0.85 : 1, flex: isFirst ? 1 : undefined },
          ]}
        >
          <Text style={{ color: canAdvance() ? theme.onPrimaryAction : theme.muted, fontWeight: '700', fontSize: layout.type.body }}>
            {saving ? 'Kaydediliyor…' : isLast ? 'Tamamla' : 'İleri'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function StepContainer({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.foreground }]}>{title}</Text>
      {subtitle && <Text style={[styles.stepSubtitle, { color: theme.muted }]}>{subtitle}</Text>}
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

function OptionGroup<T extends string>({
  options,
  value,
  onSelect,
  theme,
}: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
  theme: Record<string, string>;
}) {
  return (
    <View style={styles.optionGroup}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.optionItem,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: layout.screen.horizontal,
    paddingTop: 60,
    paddingBottom: layout.screen.bottom,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 32,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: {
    flexGrow: 1,
  },
  stepContainer: {
    gap: 8,
  },
  stepTitle: {
    fontSize: layout.type.title,
    fontWeight: '800',
  },
  stepSubtitle: {
    fontSize: layout.type.body,
    lineHeight: 22,
  },
  stepBody: {
    marginTop: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: layout.radius.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: layout.type.section,
    minHeight: layout.control.minHeight,
  },
  optionGroup: {
    gap: 10,
  },
  optionItem: {
    borderWidth: 1.5,
    borderRadius: layout.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: layout.control.minHeight,
    justifyContent: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
  },
  backButton: {
    borderWidth: 1.5,
    borderRadius: layout.radius.control,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: layout.control.minHeight,
    justifyContent: 'center',
  },
  nextButton: {
    flex: 1,
    borderRadius: layout.radius.control,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: layout.control.minHeight,
    justifyContent: 'center',
  },
  error: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: layout.type.caption,
  },
});
