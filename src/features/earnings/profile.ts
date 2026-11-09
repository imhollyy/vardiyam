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
  payEffectiveFromUtc: string;
  rulesEffectiveFromUtc: string;
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

export type EarningsOnboardingDraft = { mode: GrossPayMode; pay: string; periodDay: string; weeklyHours: string };

function minorToInput(value: number | null): string {
  if (value === null) return '';
  const formatted = (value / 100).toFixed(2);
  return formatted.includes('.') ? formatted.replace(/0+$/, '').replace(/\.$/, '') : formatted;
}

function decimalInput(value: number): string {
  return String(value);
}

export function earningsOnboardingDraft(settings: EarningsSettings): EarningsOnboardingDraft {
  return {
    mode: settings.mode,
    pay: settings.mode === 'MONTHLY_GROSS' ? minorToInput(settings.monthlyGrossMinor)
      : settings.mode === 'HOURLY_GROSS' ? minorToInput(settings.hourlyGrossMinor) : '',
    periodDay: String(settings.payrollPeriodStartDay),
    weeklyHours: decimalInput(settings.weeklyMinutes / 60),
  };
}

export function earningsRulesForOnboardingSave(
  previousSettings: EarningsSettings | null,
  previousRules: readonly EarningsRule[] | null,
  nextMode: GrossPayMode,
  effectiveFromUtc: string,
): { rules: EarningsRule[]; rulesEffectiveFromUtc: string } {
  if (!previousSettings || !previousRules) {
    return { rules: createDefaultEarningsRules(effectiveFromUtc, nextMode), rulesEffectiveFromUtc: effectiveFromUtc };
  }
  if (previousSettings.mode === nextMode) {
    return { rules: previousRules.map((rule) => ({ ...rule })), rulesEffectiveFromUtc: previousSettings.rulesEffectiveFromUtc };
  }
  const amountBasisByKind = new Map(createDefaultEarningsRules(effectiveFromUtc, nextMode).map((rule) => [rule.kind, rule.amountBasis]));
  return {
    rules: previousRules.map((rule) => ({ ...rule, amountBasis: amountBasisByKind.get(rule.kind) ?? rule.amountBasis,
      effectiveFromUtc, effectiveToUtc: null })),
    rulesEffectiveFromUtc: effectiveFromUtc,
  };
}

export function earningsPayEffectiveFromOnboardingSave(
  previousSettings: EarningsSettings | null,
  nextMode: GrossPayMode,
  nextAmountMinor: number | null,
  effectiveFromUtc: string,
): string {
  if (!previousSettings) return effectiveFromUtc;
  const previousAmount = previousSettings.mode === 'MONTHLY_GROSS' ? previousSettings.monthlyGrossMinor
    : previousSettings.mode === 'HOURLY_GROSS' ? previousSettings.hourlyGrossMinor : null;
  return previousSettings.mode === nextMode && previousAmount === nextAmountMinor && previousSettings.payEffectiveFromUtc
    ? previousSettings.payEffectiveFromUtc : effectiveFromUtc;
}

export const DEFAULT_PROFILE_ID = 'default';

export function createDefaultSettings(): EarningsSettings {
  return {
    mode: 'SKIP', payEffectiveFromUtc: '', rulesEffectiveFromUtc: '', monthlyGrossMinor: null, hourlyGrossMinor: null,
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
  const integer = (candidate: unknown, minimum: number, maximum: number) => Number.isSafeInteger(candidate) && (candidate as number) >= minimum && (candidate as number) <= maximum;
  const nullableMoney = (candidate: unknown) => candidate === null || (Number.isSafeInteger(candidate) && (candidate as number) >= 0);
  const validWindows = (candidate: unknown): boolean => Array.isArray(candidate) && candidate.every((entry) => entry && typeof entry === 'object' &&
    typeof entry.id === 'string' && typeof entry.startsAtUtc === 'string' && typeof entry.endedAtUtc === 'string' &&
    Number.isFinite(Date.parse(entry.startsAtUtc)) && Date.parse(entry.endedAtUtc) > Date.parse(entry.startsAtUtc));
  const validEffective = (candidate: unknown) => typeof candidate === 'string' && (candidate === '' ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(candidate) && Number.isFinite(Date.parse(candidate)) && new Date(Date.parse(candidate)).toISOString() === candidate);
  if (!['MONTHLY_GROSS', 'HOURLY_GROSS', 'NET_ONLY', 'SKIP'].includes(item.mode ?? '') ||
      !validEffective(item.payEffectiveFromUtc) || !validEffective(item.rulesEffectiveFromUtc) ||
      !integer(item.weeklyMinutes, 1, 10_080) || !integer(item.monthlyDividerMinutes, 1, 100_800) ||
      !integer(item.payrollPeriodStartDay, 1, 31) || !integer(item.weekStartsOn, 0, 6) ||
      typeof item.timezone !== 'string' || !item.timezone.trim() ||
      !nullableMoney(item.monthlyGrossMinor) || !nullableMoney(item.hourlyGrossMinor) ||
      typeof item.monthlyDividerConfirmed !== 'boolean' || typeof item.basePolicyConfirmed !== 'boolean' ||
      typeof item.averagingOrEqualizationUnclear !== 'boolean' || typeof item.holidayNoWindowsConfirmed !== 'boolean' ||
      typeof item.workplaceWindowCoverageConfirmed !== 'boolean' || typeof item.holidaySource !== 'string' ||
      typeof item.holidayVersion !== 'string' || typeof item.holidayCoveredFromUtc !== 'string' ||
      typeof item.holidayCoveredToUtc !== 'string' || !Array.isArray(item.completeWeekStarts) ||
      item.completeWeekStarts.some((date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      !validWindows(item.holidayWindows) || !validWindows(item.workplaceRestWindows) || !validWindows(item.workplaceHolidayWindows)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: item.timezone }); } catch { return false; }
  if ((item.mode === 'MONTHLY_GROSS' || item.mode === 'HOURLY_GROSS') && (!item.payEffectiveFromUtc || !item.rulesEffectiveFromUtc)) return false;
  if (item.mode === 'MONTHLY_GROSS' && item.monthlyGrossMinor === null) return false;
  if (item.mode === 'HOURLY_GROSS' && item.hourlyGrossMinor === null) return false;
  return true;
}

export function isEarningsRules(value: unknown): value is EarningsRule[] {
  const requiredKinds = ['NORMAL', 'EXTRA_HOURS', 'OVERTIME', 'CALENDAR_WEEKEND', 'WORKPLACE_REST_DAY', 'PUBLIC_HOLIDAY', 'WORKPLACE_HOLIDAY'];
  if (!Array.isArray(value) || value.length !== requiredKinds.length) return false;
  const kinds = new Set<string>();
  return value.every((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const rule = candidate as Partial<EarningsRule>;
    if (typeof rule.id !== 'string' || !rule.id.trim() || typeof rule.name !== 'string' || !rule.name.trim() ||
        !['NORMAL', 'EXTRA_HOURS', 'OVERTIME', 'CALENDAR_WEEKEND', 'WORKPLACE_REST_DAY', 'PUBLIC_HOLIDAY', 'WORKPLACE_HOLIDAY'].includes(rule.kind ?? '') ||
        !Number.isSafeInteger(rule.multiplierBasisPoints) || (rule.multiplierBasisPoints ?? -1) < 0 ||
        !['FULL_MULTIPLIER', 'PREMIUM_ONLY', 'INCLUDED_IN_BASE'].includes(rule.amountBasis ?? '') ||
        typeof rule.effectiveFromUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(rule.effectiveFromUtc) ||
        !Number.isFinite(Date.parse(rule.effectiveFromUtc)) || new Date(Date.parse(rule.effectiveFromUtc)).toISOString() !== rule.effectiveFromUtc ||
        (rule.effectiveToUtc !== null && (typeof rule.effectiveToUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(rule.effectiveToUtc) ||
          !Number.isFinite(Date.parse(rule.effectiveToUtc)) || new Date(Date.parse(rule.effectiveToUtc)).toISOString() !== rule.effectiveToUtc || Date.parse(rule.effectiveToUtc) <= Date.parse(rule.effectiveFromUtc)))) return false;
    const kind = rule.kind as string;
    if (!requiredKinds.includes(kind) || kinds.has(kind)) return false;
    kinds.add(kind);
    return true;
  }) && requiredKinds.every((kind) => kinds.has(kind));
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
      ...(args.records.some((record) => Date.parse(record.startedAtUtc) < Date.parse(args.settings.payEffectiveFromUtc))
        ? ['Fiilî kayıt ücret profilinin geçerlilik başlangıcından önce; bu hesap dönemi için ücret bazı doğrulanmadı.'] : []),
      ...(args.settings.averagingOrEqualizationUnclear ? ['Denkleştirme/haftalık hesap politikası bu işyeri için doğrulanmadı.'] : []),
      ...(!args.settings.workplaceWindowCoverageConfirmed ? ['İşyeri hafta tatili ve özel gün sınıflaması açıkça doğrulanmadı.'] : []),
    ],
  };
}
