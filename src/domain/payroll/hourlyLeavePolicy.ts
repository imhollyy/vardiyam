import type { HourlyLeavePolicy } from './types.ts';

export type HourlyLeavePolicyResult = {
  overtimeMinutes: number;
  baseDeductionMinutes: number;
  offsetFromOvertimeMinutes: number;
};

export type HourlyLeaveInput = {
  deductOverride: boolean | null;
  leaveHours: number;
};

/**
 * Applies the hourly leave policy at the period level.
 *
 * @param overtimeMinutes  - period total overtime (scheduled + manual), before any offset
 * @param leaveInputs      - all HOURLY leave days in the period
 * @param policy           - user's chosen policy
 *
 * Categorisation:
 *   deductOverride === false  → "free" (ücretli izin): no deduction, no offset
 *   deductOverride === true   → "mandatory": always goes to base deduction regardless of policy
 *   deductOverride === null   → "normal": apply policy
 */
export function applyHourlyLeavePolicy(
  overtimeMinutes: number,
  leaveInputs: readonly HourlyLeaveInput[],
  policy: HourlyLeavePolicy,
): HourlyLeavePolicyResult {
  let mandatoryMinutes = 0;
  let normalMinutes = 0;

  for (const input of leaveInputs) {
    const mins = Math.max(0, input.leaveHours * 60);
    if (input.deductOverride === false) {
      // free: skip entirely
    } else if (input.deductOverride === true) {
      mandatoryMinutes += mins;
    } else {
      // null → use policy
      normalMinutes += mins;
    }
  }

  let offsetFromOvertimeMinutes = 0;
  let baseDeductionMinutes = mandatoryMinutes;

  if (policy === 'OVERTIME_FIRST') {
    const offset = Math.min(overtimeMinutes, normalMinutes);
    offsetFromOvertimeMinutes = offset;
    baseDeductionMinutes += normalMinutes - offset;
  } else {
    // BASE_PAY: no offset
    baseDeductionMinutes += normalMinutes;
  }

  return {
    overtimeMinutes: overtimeMinutes - offsetFromOvertimeMinutes,
    baseDeductionMinutes,
    offsetFromOvertimeMinutes,
  };
}
