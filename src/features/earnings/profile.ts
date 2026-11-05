import {
  createDefaultEarningsRules,
  type EarningsCalculationInput,
  type EarningsPayProfile,
  type EarningsRule,
  type EarningsRuleSet,
  type GrossPayMode,
} from '../../domain/earnings.ts';

export type EarningsSettings = {
  mode: GrossPayMode;
  monthlyGrossMinor: number | null;
  hourlyGrossMinor: number | null;
  monthlyDividerMinutes: number;
  monthlyDividerConfirmed: boolean;
  weeklyMinutes: number;
  timezone: string;
  weekStartsOn: number;
  payrollPeriodStartDay: number;
  basePolicyConfirmed: boolean;
  averagingOrEqualizationUnclear: boolean;
  holidaySource: string;
  holidayVersion: string;
  holidayCoveredFromUtc: string;
  holidayCoveredToUtc: string;
  holidayNoWindowsConfirmed: boolean;
  holidayWindows: { id: string; kind: 'PUBLIC_HOLIDAY' | 'HALF_DAY_HOLIDAY'; startsAtUtc: string; endedAtUtc: string }[];
  completeWeekStarts: string[];
  workplaceRestWindows: { id: string; startsAtUtc: string; endedAtUtc: string }[];
  workplaceHolidayWindows: { id: string; startsAtUtc: string; endedAtUtc: string }[];
  workplaceWindowCoverageConfirmed: boolean;
};

export const DEFAULT_PROFILE_ID = 'default';

export function createDefaultSettings(): EarningsSettings {
  return {
    mode: 'SKIP', monthlyGrossMinor: null, hourlyGrossMinor: null,
    monthlyDividerMinutes: 225 * 60, monthlyDividerConfirmed: false,
    weeklyMinutes: 45 * 60, timezone: 'Europe/Istanbul', weekStartsOn: 1, payrollPeriodStartDay: 1,
    basePolicyConfirmed: false, averagingOrEqualizationUnclear: true,
    holidaySource: '', holidayVersion: '', holidayCoveredFromUtc: '', holidayCoveredToUtc: '', holidayNoWindowsConfirmed: false,
    holidayWindows: [],
    completeWeekStarts: [], workplaceRestWindows: [], workplaceHolidayWindows: [], workplaceWindowCoverageConfirmed: false,
  };
}

export function payProfileFromSettings(settings: EarningsSettings): EarningsPayProfile {
  return {
    mode: settings.mode,
    currency: 'TRY',
    ...(settings.monthlyGrossMinor === null ? {} : { monthlyGrossMinor: settings.monthlyGrossMinor }),
    ...(settings.hourlyGrossMinor === null ? {} : { hourlyGrossMinor: settings.hourlyGrossMinor }),
    monthlyDivider: { minutes: settings.monthlyDividerMinutes, confirmed: settings.monthlyDividerConfirmed, source: 'Kullanıcı ayarı' },
  };
}

export function ruleSetFromSettings(
  settings: EarningsSettings,
  versionId: string,
  rules: readonly EarningsRule[],
): EarningsRuleSet {
  const holidayDataset = settings.holidayNoWindowsConfirmed && settings.holidaySource.trim() && settings.holidayVersion.trim() &&
      settings.holidayCoveredFromUtc && settings.holidayCoveredToUtc
    ? { versionId: settings.holidayVersion, source: settings.holidaySource,
        coveredFromUtc: settings.holidayCoveredFromUtc, coveredToUtc: settings.holidayCoveredToUtc, windows: settings.holidayWindows }
    : null;
  return {
    profileId: DEFAULT_PROFILE_ID, versionId, timezone: settings.timezone,
    weekStartsOn: settings.weekStartsOn, payrollPeriodStartDay: settings.payrollPeriodStartDay,
    rules,
    contract: { versionId: `${versionId}-contract`, weeklyMinutes: settings.weeklyMinutes,
      effectiveFromUtc: '2000-01-01T00:00:00.000Z', effectiveToUtc: null,
      averagingOrEqualizationUnclear: settings.averagingOrEqualizationUnclear },
    holidayDataset,
    workplaceRestWindows: settings.workplaceRestWindows,
    workplaceHolidayWindows: settings.workplaceHolidayWindows,
    includedBasePolicyConfirmed: settings.basePolicyConfirmed,
  };
}

export function createDefaultRules(mode: GrossPayMode = 'SKIP'): EarningsRule[] {
  return createDefaultEarningsRules('2000-01-01T00:00:00.000Z', mode);
}

export function isEarningsSettings(value: unknown): value is EarningsSettings {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EarningsSettings>;
  return ['MONTHLY_GROSS', 'HOURLY_GROSS', 'NET_ONLY', 'SKIP'].includes(item.mode ?? '') &&
    typeof item.weeklyMinutes === 'number' && typeof item.timezone === 'string' &&
    typeof item.payrollPeriodStartDay === 'number' && Array.isArray(item.completeWeekStarts);
}

export function makeCalculationInput(args: {
  settings: EarningsSettings;
  rules: readonly EarningsRule[];
  ruleVersionId: string;
  records: EarningsCalculationInput['records'];
  completeWeekStarts: string[];
  calculationId: string;
  calculatedAtUtc: string;
}): EarningsCalculationInput {
  return {
    calculationId: args.calculationId,
    calculatedAtUtc: args.calculatedAtUtc,
    payProfile: payProfileFromSettings(args.settings),
    ruleSet: ruleSetFromSettings(args.settings, args.ruleVersionId, args.rules),
    records: args.records,
    completeWeekStarts: args.completeWeekStarts,
    unresolvedPolicyReasons: [
      ...(args.settings.averagingOrEqualizationUnclear ? ['Denkleştirme/haftalık hesap politikası bu işyeri için doğrulanmadı.'] : []),
      ...(!args.settings.workplaceWindowCoverageConfirmed ? ['İşyeri hafta tatili ve özel gün sınıflaması açıkça doğrulanmadı.'] : []),
    ],
  };
}
