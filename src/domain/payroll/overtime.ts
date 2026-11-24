import { shiftNominalMinutes } from '../../config/shifts.ts';
import type { ShiftTemplate } from '../shift-cycle/index.ts';
import type { DerivedDay } from './types.ts';

export const WEEKLY_LIMIT_MINUTES = 45 * 60; // 2700

/** Net worked minutes for a shift: gross duration minus break. */
export function netShiftMinutes(template: Pick<ShiftTemplate, 'startLocalTime' | 'endLocalTime' | 'breakMinutes'>): number {
  return shiftNominalMinutes(template.startLocalTime, template.endLocalTime) - template.breakMinutes;
}

export type DayOvertime = { localDate: string; scheduledOvertimeMinutes: number };

/**
 * Distributes weekly scheduled overtime across the worked days of each Mon-starting week.
 *
 * İzinli gün haftalık limite katkısını standart gün üzerinden yapar ama fazla mesai payı almaz.
 * Böylece izin alınan hafta diğer günlerin mesaisi değişmez.
 *
 * Rules:
 * - WORKED days (including HOURLY leave, which deriveDays sets to WORKED status):
 *     contribute their actual net shift minutes to the weekly total and receive overtime share.
 *     For HOURLY leave: net = shiftNet − leaveHours×60.
 * - LEAVE (full-day, non-HOURLY) days:
 *     contribute standardDayMin = weeklyLimit / scheduledWorkDays to weekly total,
 *     but do NOT receive any overtime distribution.
 * - LEAVE (half-day) days:
 *     contribute standardDayMin / 2 (leave credit) + actualNet / 2 (worked half)
 *     to weekly total, no overtime distribution.
 *     The leave half keeps the threshold intact; the worked half reflects actual hours.
 * - HOLIDAY and OFF days: excluded entirely.
 */
export function calculateScheduledOvertime(
  days: readonly DerivedDay[],
  templates: readonly ShiftTemplate[],
  weeklyLimitMinutes: number = WEEKLY_LIMIT_MINUTES,
): DayOvertime[] {
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const weekMap = new Map<string, DerivedDay[]>();
  for (const day of days) {
    const key = mondayWeekKey(day.localDate);
    let week = weekMap.get(key);
    if (!week) { week = []; weekMap.set(key, week); }
    week.push(day);
  }

  const result: DayOvertime[] = [];

  for (const weekDays of weekMap.values()) {
    const workedDays = weekDays.filter((d) => d.status === 'WORKED');
    const fullLeaveDays = weekDays.filter((d) => d.status === 'LEAVE' && !d.leaveHalfDay);
    const halfLeaveDays = weekDays.filter((d) => d.status === 'LEAVE' && d.leaveHalfDay);

    const scheduledWorkDays = workedDays.length + fullLeaveDays.length + halfLeaveDays.length;
    if (scheduledWorkDays === 0) continue;

    const standardDayMin = weeklyLimitMinutes / scheduledWorkDays;

    const weekTotal = workedDays.reduce((sum, d) => {
      const tpl = d.shiftTemplateId ? templateMap.get(d.shiftTemplateId) : null;
      if (!tpl) return sum;
      const net = netShiftMinutes(tpl);
      // HOURLY leave is WORKED status; its net is reduced by leave hours
      if (d.leaveType === 'HOURLY') {
        return sum + Math.max(0, net - d.leaveHours * 60);
      }
      return sum + net;
    }, 0)
      + fullLeaveDays.length * standardDayMin
      + halfLeaveDays.reduce((sum, d) => {
        const tpl = d.shiftTemplateId ? templateMap.get(d.shiftTemplateId) : null;
        const actualHalfNet = tpl ? netShiftMinutes(tpl) / 2 : 0;
        return sum + standardDayMin / 2 + actualHalfNet;
      }, 0);

    const weekExcess = Math.max(0, weekTotal - weeklyLimitMinutes);
    if (weekExcess === 0) continue;
    if (workedDays.length === 0) continue;

    const perDay = weekExcess / workedDays.length;
    for (const d of workedDays) {
      result.push({ localDate: d.localDate, scheduledOvertimeMinutes: Math.round(perDay) });
    }
  }

  return result;
}

function mondayWeekKey(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(y, m - 1, d + diff);
  const my = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const md = String(monday.getDate()).padStart(2, '0');
  return `${my}-${mm}-${md}`;
}
