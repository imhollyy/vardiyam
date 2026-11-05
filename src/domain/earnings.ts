import { segmentWorkRecord, type TimedBreakInterval, type WorkSegment } from './work-segmentation.ts';
import { getLocalDateTimeCandidates } from './work-record.ts';
import { addCalendarDays } from './shift-cycle/index.ts';

export const EARNINGS_ENGINE_VERSION = 'earnings-engine-v1';
export const EARNINGS_ROUNDING_VERSION = 'minor-unit-half-up-v1';

export type GrossPayMode = 'MONTHLY_GROSS' | 'HOURLY_GROSS' | 'NET_ONLY' | 'SKIP';
export type EarningsRuleKind = 'NORMAL' | 'EXTRA_HOURS' | 'OVERTIME' | 'CALENDAR_WEEKEND' | 'WORKPLACE_REST_DAY' | 'PUBLIC_HOLIDAY' | 'WORKPLACE_HOLIDAY';
export type RuleAmountBasis = 'FULL_MULTIPLIER' | 'PREMIUM_ONLY' | 'INCLUDED_IN_BASE';

export type EarningsRule = {
  id: string;
  kind: EarningsRuleKind;
  name: string;
  multiplierBasisPoints: number;
  amountBasis: RuleAmountBasis;
  effectiveFromUtc: string;
  effectiveToUtc: string | null;
};

export type EarningsRuleSet = {
  profileId: string;
  versionId: string;
  timezone: string;
  weekStartsOn: number;
  payrollPeriodStartDay: number;
  rules: readonly EarningsRule[];
  contract: {
    versionId: string;
    weeklyMinutes: number;
    effectiveFromUtc: string;
    effectiveToUtc: string | null;
    averagingOrEqualizationUnclear: boolean;
  };
  holidayDataset: {
    versionId: string;
    source: string;
    coveredFromUtc: string;
    coveredToUtc: string;
    windows: readonly { id: string; kind: 'PUBLIC_HOLIDAY' | 'HALF_DAY_HOLIDAY'; startsAtUtc: string; endedAtUtc: string }[];
  } | null;
  /** Explicit, user/workplace-provided rest-day intervals. OFF and weekend labels never create these. */
  workplaceRestWindows: readonly { id: string; startsAtUtc: string; endedAtUtc: string }[];
  workplaceHolidayWindows: readonly { id: string; startsAtUtc: string; endedAtUtc: string }[];
  /** Boundary hours may be paid as a separate amount where the base is already in monthly salary. */
  includedBasePolicyConfirmed: boolean;
};

export type EarningsPayProfile = {
  mode: GrossPayMode;
  currency: 'TRY';
  monthlyGrossMinor?: number;
  hourlyGrossMinor?: number;
  monthlyDivider?: { minutes: number; confirmed: boolean; source: string };
};

export type EarningsWorkRecord = {
  id: string;
  startedAtUtc: string;
  endedAtUtc: string;
  timezone: string;
  breakMinutes: number;
  timedBreakIntervals?: readonly TimedBreakInterval[];
};

export type ManualRuleSelection = { segmentId: string; ruleId: string };

export type EarningsCalculationInput = {
  calculationId: string;
  calculatedAtUtc: string;
  payProfile: EarningsPayProfile;
  ruleSet: EarningsRuleSet;
  records: readonly EarningsWorkRecord[];
  /** Caller certifies these local workweeks contain every applicable WorkRecord; otherwise overtime is withheld. */
  completeWeekStarts: readonly string[];
  manualRuleSelections?: readonly ManualRuleSelection[];
  /** Unclear settlement/averaging, missing records, or other workplace-specific uncertainty. */
  unresolvedPolicyReasons?: readonly string[];
};

export type EarningsUncertaintyCode =
  | 'GROSS_NOT_ENABLED' | 'INVALID_INPUT' | 'MONTHLY_DIVIDER_UNCONFIRMED' | 'BASE_POLICY_UNCONFIRMED'
  | 'BREAK_TIMING_UNKNOWN' | 'HOLIDAY_DATA_UNAVAILABLE' | 'RULE_NOT_COVERED' | 'CONTRACT_NOT_COVERED'
  | 'CONTRACT_RULE_INVALID' | 'POLICY_UNCLEAR' | 'OVERLAPPING_WORK' | 'WEEK_INCOMPLETE' | 'RULE_TIE' | 'MANUAL_SELECTION_INVALID' | 'AMOUNT_OVERFLOW';

export type EarningsUncertainty = { code: EarningsUncertaintyCode; message: string; segmentId?: string };

export type EarningsLine = {
  id: string;
  segmentId: string;
  workRecordId: string;
  startedAtUtc: string;
  endedAtUtc: string;
  minutes: number;
  localDate: string;
  weekStartLocalDate: string;
  payrollPeriodStartDate: string;
  hourlyBaseNumeratorMinor: number;
  hourlyBaseDenominatorMinutes: number;
  hourlyBaseDescription: string;
  selectedRuleId: string | null;
  selectedRuleName: string | null;
  selectedRuleKind: EarningsRuleKind | null;
  multiplierBasisPoints: number | null;
  amountBasis: RuleAmountBasis | null;
  includedInBaseSalary: boolean | null;
  selectionReason: string;
  ruleSetVersionId: string;
  contractVersionId: string;
  holidayDatasetVersion: string | null;
  roundingMode: typeof EARNINGS_ROUNDING_VERSION;
  amountMinor: number | null;
};

export type EarningsSnapshotContract = {
  schemaVersion: 'earnings-snapshot-v1';
  engineVersion: typeof EARNINGS_ENGINE_VERSION;
  roundingVersion: typeof EARNINGS_ROUNDING_VERSION;
  calculationId: string;
  calculatedAtUtc: string;
  workRecordIds: string[];
  profileId: string;
  payMode: GrossPayMode;
  ruleSetVersionId: string;
  contractVersionId: string;
  holidayDatasetVersion: string | null;
  monthlyGrossMinor: number | null;
  hourlyGrossMinor: number | null;
  monthlyDividerMinutes: number | null;
  monthlyDividerSource: string | null;
  lines: EarningsLine[];
};

export type EarningsCalculationResult = {
  status: 'COMPLETE' | 'PARTIAL' | 'WITHHELD' | 'NO_GROSS_MODE';
  totalAmountMinor: number | null;
  lines: EarningsLine[];
  uncertainties: EarningsUncertainty[];
  snapshot: EarningsSnapshotContract | null;
};

const MINUTE = 60_000;
const CANONICAL_UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/;
const KIND_ORDER: EarningsRuleKind[] = ['NORMAL', 'EXTRA_HOURS', 'OVERTIME', 'CALENDAR_WEEKEND', 'WORKPLACE_REST_DAY', 'PUBLIC_HOLIDAY', 'WORKPLACE_HOLIDAY'];

function validInstant(value: string): number | null {
  if (typeof value !== 'string' || !CANONICAL_UTC_MINUTE.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : null;
}

function addUncertainty(list: EarningsUncertainty[], code: EarningsUncertaintyCode, message: string, segmentId?: string): void {
  list.push(segmentId ? { code, message, segmentId } : { code, message });
}

function roundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator < 0n) throw new Error('Invalid non-negative money rational.');
  const rounded = (numerator * 2n + denominator) / (2n * denominator);
  const number = Number(rounded);
  if (!Number.isSafeInteger(number)) throw new Error('Amount exceeds safe integer kuruş range.');
  return number;
}

function ruleAppliesAt(rule: EarningsRule, instant: number): boolean {
  const from = validInstant(rule.effectiveFromUtc);
  const to = rule.effectiveToUtc === null ? Number.POSITIVE_INFINITY : validInstant(rule.effectiveToUtc);
  return from !== null && to !== null && from <= instant && instant < to;
}

function overlaps(start: number, end: number, windows: readonly { startsAtUtc: string; endedAtUtc: string }[]): boolean {
  return windows.some((window) => {
    const from = validInstant(window.startsAtUtc);
    const to = validInstant(window.endedAtUtc);
    return from !== null && to !== null && start < to && end > from;
  });
}

function mkLine(
  recordId: string,
  segmentId: string,
  segment: WorkSegment,
  start: number,
  end: number,
  minutes: number,
  numeratorMinor: number,
  denominatorMinutes: number,
  hourlyDescription: string,
  rule: EarningsRule | null,
  included: boolean,
  reason: string,
  input: EarningsCalculationInput,
  amountMinor: number | null,
): EarningsLine {
  return {
    id: `${recordId}:${segmentId}:${start}`,
    segmentId,
    workRecordId: recordId,
    startedAtUtc: new Date(start).toISOString(),
    endedAtUtc: new Date(end).toISOString(),
    minutes,
    localDate: segment.localDate,
    weekStartLocalDate: segment.weekStartLocalDate,
    payrollPeriodStartDate: segment.payrollPeriodStartDate,
    hourlyBaseNumeratorMinor: numeratorMinor,
    hourlyBaseDenominatorMinutes: denominatorMinutes,
    hourlyBaseDescription: hourlyDescription,
    selectedRuleId: rule?.id ?? null,
    selectedRuleName: rule?.name ?? null,
    selectedRuleKind: rule?.kind ?? null,
    multiplierBasisPoints: rule?.multiplierBasisPoints ?? null,
    amountBasis: rule?.amountBasis ?? null,
    includedInBaseSalary: rule ? included : null,
    selectionReason: reason,
    ruleSetVersionId: input.ruleSet.versionId,
    contractVersionId: input.ruleSet.contract.versionId,
    holidayDatasetVersion: input.ruleSet.holidayDataset?.versionId ?? null,
    roundingMode: EARNINGS_ROUNDING_VERSION,
    amountMinor,
  };
}

function basicValidation(input: EarningsCalculationInput, uncertainties: EarningsUncertainty[]): boolean {
  const { payProfile: pay, ruleSet: set } = input;
  const calculatedAt = validInstant(input.calculatedAtUtc);
  if (!input.calculationId || !calculatedAt || !set.profileId || !set.versionId || !set.contract.versionId ||
      !Array.isArray(input.completeWeekStarts) ||
      !Number.isInteger(set.weekStartsOn) || set.weekStartsOn < 0 || set.weekStartsOn > 6 ||
      !Number.isInteger(set.payrollPeriodStartDay) || set.payrollPeriodStartDay < 1 || set.payrollPeriodStartDay > 31 ||
      !Number.isSafeInteger(set.contract.weeklyMinutes) || set.contract.weeklyMinutes <= 0 ||
      set.contract.weeklyMinutes > 7 * 24 * 60 || pay.currency !== 'TRY') {
    addUncertainty(uncertainties, 'INVALID_INPUT', 'Hesap, sözleşme veya dönem girdilerinden biri geçersiz.');
    return false;
  }
  if (pay.mode === 'NET_ONLY' || pay.mode === 'SKIP') {
    addUncertainty(uncertainties, 'GROSS_NOT_ENABLED', 'Net-only veya ücret bilgisi atlanan profilde tahmini brüt hesaplanmaz.');
    return false;
  }
  if (pay.mode === 'MONTHLY_GROSS') {
    if (!Number.isSafeInteger(pay.monthlyGrossMinor) || (pay.monthlyGrossMinor ?? -1) < 0) {
      addUncertainty(uncertainties, 'INVALID_INPUT', 'Aylık brüt tutar kuruş cinsinden geçersiz.');
      return false;
    }
    if (!pay.monthlyDivider?.confirmed || !Number.isSafeInteger(pay.monthlyDivider.minutes) || pay.monthlyDivider.minutes <= 0 || !pay.monthlyDivider.source.trim()) {
      addUncertainty(uncertainties, 'MONTHLY_DIVIDER_UNCONFIRMED', 'Aylık saat böleni kullanıcı tarafından açıkça onaylanmalı; 225 saat önerisi kendiliğinden kullanılmaz.');
      return false;
    }
  } else if (pay.mode === 'HOURLY_GROSS') {
    if (!Number.isSafeInteger(pay.hourlyGrossMinor) || (pay.hourlyGrossMinor ?? -1) < 0) {
      addUncertainty(uncertainties, 'INVALID_INPUT', 'Saatlik brüt ücret kuruş cinsinden geçersiz.');
      return false;
    }
  }

  const ruleIds = new Set<string>();
  for (const rule of set.rules) {
    const from = validInstant(rule.effectiveFromUtc);
    const to = rule.effectiveToUtc === null ? Number.POSITIVE_INFINITY : validInstant(rule.effectiveToUtc);
    if (!rule.id || !rule.name.trim() || ruleIds.has(rule.id) || !KIND_ORDER.includes(rule.kind) ||
        !Number.isSafeInteger(rule.multiplierBasisPoints) || rule.multiplierBasisPoints <= 0 ||
        !['FULL_MULTIPLIER', 'PREMIUM_ONLY', 'INCLUDED_IN_BASE'].includes(rule.amountBasis) || from === null || to === null || to <= from) {
      addUncertainty(uncertainties, 'INVALID_INPUT', 'Sürümlü işyeri kuralı veya geçerlilik aralığı geçersiz.');
      return false;
    }
    ruleIds.add(rule.id);
  }
  const normalRules = set.rules.filter((rule) => rule.kind === 'NORMAL');
  if (normalRules.length === 0 || (pay.mode === 'MONTHLY_GROSS' && normalRules.some((rule) => rule.amountBasis !== 'INCLUDED_IN_BASE'))) {
    addUncertainty(uncertainties, 'BASE_POLICY_UNCONFIRMED', 'Normal saatlerin aylık maaşa dahil olduğu doğrulanmalı ve kuralda ek tutar olarak işaretlenmemeli.');
    return false;
  }
  return true;
}

/** Pure, deterministic estimate. It never reads storage, current time, network, or legal datasets. */
export function calculateGrossEarnings(input: EarningsCalculationInput): EarningsCalculationResult {
  const uncertainties: EarningsUncertainty[] = [];
  if (!basicValidation(input, uncertainties)) {
    const onlyNoGross = uncertainties.length === 1 && uncertainties[0].code === 'GROSS_NOT_ENABLED';
    return { status: onlyNoGross ? 'NO_GROSS_MODE' : 'WITHHELD', totalAmountMinor: null, lines: [], uncertainties, snapshot: null };
  }
  if (!input.records.length) {
    addUncertainty(uncertainties, 'INVALID_INPUT', 'En az bir fiilî çalışma kaydı gereklidir.');
    return { status: 'WITHHELD', totalAmountMinor: null, lines: [], uncertainties, snapshot: null };
  }

  const pay = input.payProfile;
  const set = input.ruleSet;
  const hourlyNumerator = pay.mode === 'MONTHLY_GROSS' ? pay.monthlyGrossMinor! : pay.hourlyGrossMinor!;
  const hourlyDenominator = pay.mode === 'MONTHLY_GROSS' ? pay.monthlyDivider!.minutes : 60;
  const hourlyDescription = pay.mode === 'MONTHLY_GROSS'
    ? `Aylık brüt ${pay.monthlyGrossMinor} kuruş / onaylı bölen ${pay.monthlyDivider!.minutes} dakika (${pay.monthlyDivider!.source})`
    : `Saatlik brüt ${pay.hourlyGrossMinor} kuruş`;

  if (pay.mode === 'MONTHLY_GROSS' && !set.includedBasePolicyConfirmed) {
    addUncertainty(uncertainties, 'BASE_POLICY_UNCONFIRMED', 'Aylık ücrete dahil temel çalışma ile ayrıca ödenecek tutar ayrımı onaylanmalı.');
  }
  if (set.contract.averagingOrEqualizationUnclear) {
    addUncertainty(uncertainties, 'POLICY_UNCLEAR', 'Denkleştirme veya referans haftası belirsiz; kesin fazla süre sınıflandırması yapılamaz.');
  }
  for (const reason of input.unresolvedPolicyReasons ?? []) addUncertainty(uncertainties, 'POLICY_UNCLEAR', reason);

  const working: { record: EarningsWorkRecord; segment: WorkSegment; start: number; end: number; minutes: number }[] = [];
  for (const record of input.records) {
    const start = validInstant(record.startedAtUtc);
    const end = validInstant(record.endedAtUtc);
    if (!record.id || start === null || end === null || end <= start || record.timezone !== set.timezone || !Number.isSafeInteger(record.breakMinutes) || record.breakMinutes < 0) {
      addUncertainty(uncertainties, 'INVALID_INPUT', 'Fiilî çalışma kaydı veya zaman dilimi geçersiz.');
      continue;
    }
    const holidayFrom = set.holidayDataset ? validInstant(set.holidayDataset.coveredFromUtc) : null;
    const holidayTo = set.holidayDataset ? validInstant(set.holidayDataset.coveredToUtc) : null;
    if (!set.holidayDataset || !set.holidayDataset.versionId.trim() || !set.holidayDataset.source.trim() ||
        holidayFrom === null || holidayTo === null || holidayTo <= holidayFrom || start < holidayFrom || end > holidayTo) {
      addUncertainty(uncertainties, 'HOLIDAY_DATA_UNAVAILABLE', 'Çalışma tarihlerini kapsayan kaynaklı/sürümlü resmî tatil verisi yok.');
      continue;
    }
    const breakIntervals = record.timedBreakIntervals?.length ? record.timedBreakIntervals : undefined;
    const cutWindows: { id: string; kind: 'PUBLIC_HOLIDAY' | 'HALF_DAY_HOLIDAY' | 'WORKPLACE_RULE_CHANGE' | 'CUSTOM'; startsAtUtc: string; endedAtUtc: string }[] = [
      ...(set.holidayDataset?.windows ?? []),
      ...set.workplaceRestWindows.map((w) => ({ ...w, kind: 'CUSTOM' as const })),
      ...set.workplaceHolidayWindows.map((w) => ({ ...w, kind: 'CUSTOM' as const })),
    ];
    for (const boundary of [set.contract.effectiveFromUtc, set.contract.effectiveToUtc].filter((v): v is string => v !== null)) {
      const at = validInstant(boundary);
      if (at !== null && at > start && at < end) {
        cutWindows.push({ id: `contract-cut-${record.id}-${at}`, kind: 'WORKPLACE_RULE_CHANGE', startsAtUtc: boundary, endedAtUtc: new Date(end).toISOString() });
      }
    }
    // Each applicable window creates exact UTC cuts. Additional rule validity boundaries are represented
    // by windows extending to the containing record edge, so a changed rule is never applied mid-line.
    for (const rule of set.rules) {
      for (const boundary of [rule.effectiveFromUtc, rule.effectiveToUtc].filter((v): v is string => v !== null)) {
        const at = validInstant(boundary);
        if (at !== null && at > start && at < end) {
          cutWindows.push({ id: `rule-cut-${rule.id}-${at}`, kind: 'WORKPLACE_RULE_CHANGE', startsAtUtc: boundary, endedAtUtc: new Date(end).toISOString() });
        }
      }
    }
    let segmented: ReturnType<typeof segmentWorkRecord>;
    try {
      const preliminary = segmentWorkRecord(record, { weekStartsOn: set.weekStartsOn, payrollPeriodStartDay: set.payrollPeriodStartDay, breakIntervals });
      for (const segment of preliminary.segments) {
        if (segment.localDate !== segment.payrollPeriodStartDate) continue;
        const candidates = getLocalDateTimeCandidates(`${segment.localDate}T00:00`, record.timezone);
        const instant = candidates.length === 1 ? validInstant(candidates[0]) : null;
        if (instant !== null && instant > start && instant < end) {
          cutWindows.push({ id: `payroll-cut-${segment.localDate}-${record.id}`, kind: 'CUSTOM', startsAtUtc: candidates[0], endedAtUtc: new Date(end).toISOString() });
        }
      }
      segmented = segmentWorkRecord(record, {
        weekStartsOn: set.weekStartsOn,
        payrollPeriodStartDay: set.payrollPeriodStartDay,
        breakIntervals,
        boundaryWindows: cutWindows,
      });
    } catch {
      addUncertainty(uncertainties, 'INVALID_INPUT', 'Çalışma kaydı, mola aralığı veya IANA zaman dilimi segmentasyondan geçemedi.');
      continue;
    }
    if (segmented.breakTiming === 'AGGREGATE_ONLY' || (record.breakMinutes > 0 && !record.timedBreakIntervals?.length)) {
      addUncertainty(uncertainties, 'BREAK_TIMING_UNKNOWN', 'Mola anları bilinmediği için hangi ücret sınıfı dakikalarını etkilediği belirlenemiyor.');
      continue;
    }
    for (const segment of segmented.segments) {
      if (segment.workedMinutes === null) {
        addUncertainty(uncertainties, 'BREAK_TIMING_UNKNOWN', 'Mola anları bilinmediği için kesin süre sınıflandırılamıyor.');
        continue;
      }
      if (segment.workedMinutes > 0) working.push({ record, segment, start: Date.parse(segment.startedAtUtc), end: Date.parse(segment.endedAtUtc), minutes: segment.workedMinutes });
    }
  }
  working.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < working.length; i += 1) {
    if (working[i].start < working[i - 1].end) {
      addUncertainty(uncertainties, 'OVERLAPPING_WORK', 'Çalışma kayıtlarının zaman aralıkları çakışıyor; aynı dakika iki kez ücretlendirilmeyecek.');
      break;
    }
  }

  const contractFrom = validInstant(set.contract.effectiveFromUtc);
  const contractTo = set.contract.effectiveToUtc === null ? Number.POSITIVE_INFINITY : validInstant(set.contract.effectiveToUtc);
  const holidayWindows = set.holidayDataset?.windows ?? [];
  const lines: EarningsLine[] = [];
  const weeklyMinutes = new Map<string, number>();
  const selections = new Map((input.manualRuleSelections ?? []).map((item) => [item.segmentId, item.ruleId]));
  for (const item of working) {
    const { record, segment, start, end, minutes } = item;
    const baseId = `${record.id}:${segment.startedAtUtc}:${segment.endedAtUtc}`;
    const applicableRules = set.rules.filter((rule) => ruleAppliesAt(rule, start));
    const activeContract = contractFrom !== null && contractTo !== null && contractFrom <= start && end <= contractTo;
    if (!activeContract) {
      addUncertainty(uncertainties, 'CONTRACT_NOT_COVERED', 'Bu çalışma aralığı için geçerli sözleşme haftası tanımlı değil.', baseId);
      lines.push(mkLine(record.id, baseId, segment, start, end, minutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Sözleşme geçerliliği yok; kesin tutar yok.', input, null));
      continue;
    }
    const crossesRuleExpiry = set.rules.some((rule) => {
      const from = validInstant(rule.effectiveFromUtc)!;
      const to = rule.effectiveToUtc === null ? Number.POSITIVE_INFINITY : validInstant(rule.effectiveToUtc)!;
      return (from > start && from < end) || (to > start && to < end);
    });
    if (crossesRuleExpiry) {
      addUncertainty(uncertainties, 'RULE_NOT_COVERED', 'Kural geçerlilik sınırı segmentin içinde; sınıflandırma kesin değil.', baseId);
      lines.push(mkLine(record.id, baseId, segment, start, end, minutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Kural sınırı segmenti kesiyor; kesin tutar yok.', input, null));
      continue;
    }
    if (applicableRules.length === 0) {
      addUncertainty(uncertainties, 'RULE_NOT_COVERED', 'Bu anda geçerli işyeri kural sürümü yok.', baseId);
      lines.push(mkLine(record.id, baseId, segment, start, end, minutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Uygulanabilir kural yok; kesin tutar yok.', input, null));
      continue;
    }
    const weekKey = `${segment.weekStartLocalDate}`;
    const weekStartCandidates = getLocalDateTimeCandidates(`${weekKey}T00:00`, set.timezone);
    const nextWeek = addCalendarDays(weekKey, 7);
    const weekEndCandidates = getLocalDateTimeCandidates(`${nextWeek}T00:00`, set.timezone);
    const weekStartUtc = weekStartCandidates.length === 1 ? validInstant(weekStartCandidates[0]) : null;
    const weekEndUtc = weekEndCandidates.length === 1 ? validInstant(weekEndCandidates[0]) : null;
    const contractBoundaryMidweek = weekStartUtc === null || weekEndUtc === null ||
      (contractFrom !== null && contractFrom > weekStartUtc && contractFrom < weekEndUtc) ||
      (contractTo !== null && contractTo > weekStartUtc && contractTo < weekEndUtc);
    if (contractBoundaryMidweek) {
      addUncertainty(uncertainties, 'CONTRACT_RULE_INVALID', 'Sözleşme geçerliliği işyeri haftasının içinde değişiyor; haftalık eşik güvenle uygulanamıyor.', baseId);
      lines.push(mkLine(record.id, baseId, segment, start, end, minutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Sözleşme hafta içinde değişiyor; kesin tutar yok.', input, null));
      continue;
    }
    if (!input.completeWeekStarts.includes(weekKey)) {
      addUncertainty(uncertainties, 'WEEK_INCOMPLETE', 'Bu yerel hafta için bütün fiilî kayıtların kapsandığı doğrulanmadı; fazla çalışma sınıfı ve tutar bekletildi.', baseId);
      lines.push(mkLine(record.id, baseId, segment, start, end, minutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Tam hafta girdisi yok; kesin sınıflandırma yok.', input, null));
      continue;
    }
    const before = weeklyMinutes.get(weekKey) ?? 0;
    const contractThreshold = set.contract.weeklyMinutes;
    // A segment crossing either quota is cut by elapsed work minutes, without counting it twice.
    const boundaries = [contractThreshold < 45 * 60 ? contractThreshold : 45 * 60, 45 * 60]
      .filter((v, index, all) => all.indexOf(v) === index && v > before && v < before + minutes);
    const cuts = [0, ...boundaries.map((v) => v - before), minutes];
    for (let c = 0; c < cuts.length - 1; c += 1) {
      const subMinutes = cuts[c + 1] - cuts[c];
      if (subMinutes <= 0) continue;
      const subStart = start + cuts[c] * MINUTE;
      const subEnd = subStart + subMinutes * MINUTE;
      const consumedBefore = before + cuts[c];
      const overtime = consumedBefore >= 45 * 60 ? 'OVERTIME'
        : consumedBefore >= contractThreshold && contractThreshold < 45 * 60 ? 'EXTRA_HOURS'
        : 'NORMAL';
      const subId = `${baseId}:${new Date(subStart).toISOString()}`;
      const candidates = applicableRules.filter((rule) => rule.kind === overtime);
      if (overlaps(subStart, subEnd, set.workplaceRestWindows)) candidates.push(...applicableRules.filter((rule) => rule.kind === 'WORKPLACE_REST_DAY'));
      if (overlaps(subStart, subEnd, set.workplaceHolidayWindows)) candidates.push(...applicableRules.filter((rule) => rule.kind === 'WORKPLACE_HOLIDAY'));
      if (holidayWindows.some((w) => { const a = validInstant(w.startsAtUtc); const b = validInstant(w.endedAtUtc); return a !== null && b !== null && subStart < b && subEnd > a; })) {
        candidates.push(...applicableRules.filter((rule) => rule.kind === 'PUBLIC_HOLIDAY'));
      }
      const weekday = new Date(`${segment.localDate}T12:00:00.000Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) candidates.push(...applicableRules.filter((rule) => rule.kind === 'CALENDAR_WEEKEND'));
      const unique = [...new Map(candidates.map((rule) => [rule.id, rule])).values()];
      if (unique.length === 0) {
        addUncertainty(uncertainties, 'RULE_NOT_COVERED', 'Bu çalışma dakikası için geçerli ücret sınıfı kuralı tanımlı değil.', subId);
        const subSegment = { ...segment, startedAtUtc: new Date(subStart).toISOString(), endedAtUtc: new Date(subEnd).toISOString() };
        lines.push(mkLine(record.id, subId, subSegment, subStart, subEnd, subMinutes, hourlyNumerator, hourlyDenominator, hourlyDescription, null, false, 'Ücret sınıfı kuralı yok; kesin tutar yok.', input, null));
        continue;
      }
      const maximum = Math.max(...unique.map((rule) => rule.multiplierBasisPoints));
      const leaders = unique.filter((rule) => rule.multiplierBasisPoints === maximum);
      let selected: EarningsRule | null = null;
      const manualId = selections.get(subId) ?? selections.get(baseId);
      if (manualId) {
        selected = leaders.find((rule) => rule.id === manualId) ?? null;
        if (!selected) addUncertainty(uncertainties, 'MANUAL_SELECTION_INVALID', 'Manuel seçim geçerli en yüksek katsayılı kurallardan biri değil.', subId);
      } else if (leaders.length === 1) selected = leaders[0];
      else addUncertainty(uncertainties, 'RULE_TIE', 'Farklı kurallar eşit en yüksek katsayıya sahip; manuel seçim gerekir.', subId);

      const included = selected?.amountBasis === 'PREMIUM_ONLY' || selected?.amountBasis === 'INCLUDED_IN_BASE';
      const basisBps = selected ? (selected.amountBasis === 'PREMIUM_ONLY'
        ? Math.max(0, selected.multiplierBasisPoints - 10_000)
        : selected.amountBasis === 'INCLUDED_IN_BASE' ? 0 : selected.multiplierBasisPoints) : null;
      let amount: number | null = null;
      if (selected && basisBps !== null) {
        // amountMinor = baseMinor/hour * minutes * multiplier; retain exact rational until final half-up rounding.
        try {
          amount = roundHalfUp(BigInt(hourlyNumerator) * BigInt(subMinutes) * BigInt(basisBps), BigInt(hourlyDenominator) * 10_000n);
        } catch {
          addUncertainty(uncertainties, 'AMOUNT_OVERFLOW', 'Hesaplanan satır tutarı güvenli kuruş aralığını aşıyor.', subId);
        }
      }
      const categoryReason = overtime === 'OVERTIME'
        ? 'Yerel işyeri haftasında 45 saat eşiği aşıldı.'
        : overtime === 'EXTRA_HOURS' ? 'Sözleşme haftalık süresi ile 45 saat arasındaki aralık.'
        : 'Sözleşme ve 45 saatlik haftalık eşikler aşılmadı.';
      const reason = selected
        ? `${categoryReason} ${manualId ? 'Kullanıcı, en yüksek geçerli katsayılar arasından açıkça seçti.' : unique.length > 1 ? 'En yüksek tek katsayı seçildi; örtüşen oranlar toplanmadı.' : 'Tek geçerli kural uygulandı.'}`
        : 'Kural seçilemedi; bu kalem kesin tutara katılmadı.';
      const subSegment = { ...segment, startedAtUtc: new Date(subStart).toISOString(), endedAtUtc: new Date(subEnd).toISOString() };
      lines.push(mkLine(record.id, subId, subSegment, subStart, subEnd, subMinutes, hourlyNumerator, hourlyDenominator, hourlyDescription, selected, included, reason, input, amount));
    }
    weeklyMinutes.set(weekKey, before + minutes);
  }

  if (uncertainties.some((u) => ['POLICY_UNCLEAR', 'BASE_POLICY_UNCONFIRMED', 'CONTRACT_RULE_INVALID'].includes(u.code))) {
    for (let index = 0; index < lines.length; index += 1) lines[index] = { ...lines[index], amountMinor: null };
  }
  let total: number | null = null;
  if (uncertainties.length === 0 && lines.every((line) => line.amountMinor !== null)) {
    const exactTotal = lines.reduce((sum, line) => sum + BigInt(line.amountMinor!), 0n);
    if (exactTotal <= BigInt(Number.MAX_SAFE_INTEGER)) total = Number(exactTotal);
    else addUncertainty(uncertainties, 'AMOUNT_OVERFLOW', 'Toplam tahmini brüt güvenli kuruş aralığını aşıyor.');
  }
  const snapshot: EarningsSnapshotContract | null = lines.length ? {
    schemaVersion: 'earnings-snapshot-v1' as const,
    engineVersion: EARNINGS_ENGINE_VERSION as typeof EARNINGS_ENGINE_VERSION,
    roundingVersion: EARNINGS_ROUNDING_VERSION as typeof EARNINGS_ROUNDING_VERSION,
    calculationId: input.calculationId,
    calculatedAtUtc: input.calculatedAtUtc,
    workRecordIds: input.records.map(({ id }) => id).sort(),
    profileId: set.profileId,
    payMode: pay.mode,
    ruleSetVersionId: set.versionId,
    contractVersionId: set.contract.versionId,
    holidayDatasetVersion: set.holidayDataset?.versionId ?? null,
    monthlyGrossMinor: pay.mode === 'MONTHLY_GROSS' ? pay.monthlyGrossMinor! : null,
    hourlyGrossMinor: pay.mode === 'HOURLY_GROSS' ? pay.hourlyGrossMinor! : null,
    monthlyDividerMinutes: pay.mode === 'MONTHLY_GROSS' ? pay.monthlyDivider!.minutes : null,
    monthlyDividerSource: pay.mode === 'MONTHLY_GROSS' ? pay.monthlyDivider!.source : null,
    lines,
  } : null;
  return { status: total !== null ? 'COMPLETE' : lines.some((line) => line.amountMinor !== null) ? 'PARTIAL' : 'WITHHELD', totalAmountMinor: total, lines, uncertainties, snapshot };
}

/** Suggested defaults are workplace policy values only; adjust inclusion basis to the workplace/pay mode. */
export function createDefaultEarningsRules(effectiveFromUtc: string, payMode: GrossPayMode = 'MONTHLY_GROSS'): EarningsRule[] {
  const definitions: [EarningsRuleKind, string, number][] = [
    ['NORMAL', 'Normal çalışma', 10_000], ['EXTRA_HOURS', 'Fazla sürelerle çalışma (işyeri varsayılanı)', 12_500],
    ['OVERTIME', 'Fazla çalışma (işyeri varsayılanı)', 15_000], ['CALENDAR_WEEKEND', 'Takvim hafta sonu (işyeri varsayılanı)', 20_000],
    ['WORKPLACE_REST_DAY', 'İşyeri hafta tatili (işyeri varsayılanı)', 20_000], ['PUBLIC_HOLIDAY', 'Kaynaklı resmî tatil (işyeri varsayılanı)', 20_000],
    ['WORKPLACE_HOLIDAY', 'İşyeri özel tatili (işyeri varsayılanı)', 20_000],
  ];
  return definitions.map(([kind, name, multiplierBasisPoints]) => ({
    id: `workplace-default-${kind.toLowerCase()}`, kind, name, multiplierBasisPoints,
    amountBasis: kind === 'NORMAL' && payMode === 'MONTHLY_GROSS' ? 'INCLUDED_IN_BASE'
      : payMode === 'MONTHLY_GROSS' && (kind === 'WORKPLACE_REST_DAY' || kind === 'PUBLIC_HOLIDAY' || kind === 'WORKPLACE_HOLIDAY') ? 'PREMIUM_ONLY'
      : 'FULL_MULTIPLIER', effectiveFromUtc, effectiveToUtc: null,
  }));
}
