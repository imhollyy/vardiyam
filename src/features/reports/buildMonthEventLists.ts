import type { DerivedDay, LeaveType } from '../../domain/payroll/types.ts';
import { LEAVE_TYPES } from '../../config/payroll.ts';

export type LeaveEvent = {
  localDate: string;
  leaveType: LeaveType;
  leaveHalfDay: boolean;
  leaveHours: number;
  deducted: boolean;
};

export type OvertimeEvent = {
  localDate: string;
  overtimeMinutes: number;
  isScheduled: boolean;
};

export type LateEarlyEvent = {
  localDate: string;
  lateEarlyMinutes: number;
};

export type MonthEventLists = {
  leaves: LeaveEvent[];
  overtime: OvertimeEvent[];
  scheduledOvertimeMinutes: number;
  lateEarly: LateEarlyEvent[];
};

function defaultDeducted(leaveType: LeaveType): boolean {
  return LEAVE_TYPES.find((lt) => lt.code === leaveType)?.deductFromSalary ?? false;
}

export function buildMonthEventLists(days: readonly DerivedDay[]): MonthEventLists {
  const leaves: LeaveEvent[] = [];
  const overtime: OvertimeEvent[] = [];
  let scheduledOvertimeMinutes = 0;
  const lateEarly: LateEarlyEvent[] = [];

  for (const day of days) {
    if ((day.status === 'LEAVE' || day.leaveType === 'HOURLY') && day.leaveType && day.leaveType !== 'HOLIDAY') {
      leaves.push({
        localDate: day.localDate,
        leaveType: day.leaveType,
        leaveHalfDay: day.leaveHalfDay,
        leaveHours: day.leaveHours,
        deducted: defaultDeducted(day.leaveType),
      });
    }

    if (day.overtimeMinutes > 0) {
      overtime.push({
        localDate: day.localDate,
        overtimeMinutes: day.overtimeMinutes,
        isScheduled: false,
      });
    }

    if (day.lateEarlyMinutes > 0) {
      lateEarly.push({ localDate: day.localDate, lateEarlyMinutes: day.lateEarlyMinutes });
    }
  }

  return { leaves, overtime, scheduledOvertimeMinutes, lateEarly };
}
