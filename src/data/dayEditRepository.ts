import type { SQLiteDatabase } from 'expo-sqlite';
import { dayOrdinal, validatePlanOverrides, validateShiftTemplate, type LocalDate, type PlanOverride, type ShiftTemplate } from '../domain/shift-cycle/index.ts';
import type { WorkDayStatus } from './workSessionRepository.ts';
import { withDatabaseTransaction } from './transactions.ts';

type DayEditDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'>;
export type DayEdit = { cycleId: string | null; localDate: LocalDate; override: PlanOverride | null; plannedTimes?: { startLocalTime: string; endLocalTime: string } | null; status: WorkDayStatus | null; note: string | null; updatedAtUtc: string };

/** Persists a user's single-day plan and annotation together without touching actual WorkRecords. */
export async function saveDayEdit(database: DayEditDatabase, edit: DayEdit): Promise<void> {
  dayOrdinal(edit.localDate);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(edit.updatedAtUtc) || !Number.isFinite(Date.parse(edit.updatedAtUtc))) throw new Error('Güncelleme zamanı geçersiz.');
  if (edit.note !== null && edit.note.length > 2000) throw new Error('Not 2000 karakteri aşamaz.');
  if (edit.status !== null && !['LEAVE', 'SICK_REPORT', 'NOT_WORKED'].includes(edit.status)) throw new Error('Gün durumu geçersiz.');
  if (edit.override && edit.override.localDate !== edit.localDate) throw new Error('Plan tarihi seçilen günle eşleşmiyor.');
  if (edit.override && !edit.cycleId) throw new Error('Vardiya planını düzenlemek için önce bir vardiya düzeni oluştur.');
  const validLocalTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (edit.plannedTimes && (!edit.override || edit.override.kind !== 'SHIFT' || !validLocalTime(edit.plannedTimes.startLocalTime) || !validLocalTime(edit.plannedTimes.endLocalTime))) {
    throw new Error('Planlanan vardiya saatleri geçersiz.');
  }

  await withDatabaseTransaction(database, async () => {
    const foreignKeys = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    if (foreignKeys?.foreign_keys !== 1) throw new Error('Veritabanı yabancı anahtar denetimi hazır değil.');
    if (edit.cycleId && edit.override) {
      const cycle = await database.getFirstAsync<{ id: string }>('SELECT id FROM shift_cycles WHERE id = ?;', edit.cycleId);
      if (!cycle) throw new Error('Vardiya düzeni bulunamadı.');
      const templates = (await database.getAllAsync<{ id: string; code: string; name: string; start_local_time: string; end_local_time: string; color_token: string | null; icon_key: string | null }>('SELECT id, code, name, start_local_time, end_local_time, color_token, icon_key FROM shift_templates;'))
        .map((row): ShiftTemplate => ({ id: row.id, code: row.code, name: row.name, startLocalTime: row.start_local_time, endLocalTime: row.end_local_time, ...(row.color_token ? { colorToken: row.color_token } : {}), ...(row.icon_key ? { iconKey: row.icon_key } : {}) }));
      for (const template of templates) validateShiftTemplate(template);
      validatePlanOverrides([edit.override], templates);
      await database.runAsync(`INSERT INTO plan_overrides(cycle_id, local_date, kind, template_id, reason) VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(cycle_id, local_date) DO UPDATE SET kind = excluded.kind, template_id = excluded.template_id;`,
        edit.cycleId, edit.localDate, edit.override.kind, edit.override.kind === 'SHIFT' ? edit.override.templateId : null);
      if (edit.override.kind === 'SHIFT' && edit.plannedTimes) {
        await database.runAsync(`INSERT INTO plan_time_overrides(cycle_id, local_date, start_local_time, end_local_time) VALUES (?, ?, ?, ?)
          ON CONFLICT(cycle_id, local_date) DO UPDATE SET start_local_time = excluded.start_local_time, end_local_time = excluded.end_local_time;`,
          edit.cycleId, edit.localDate, edit.plannedTimes.startLocalTime, edit.plannedTimes.endLocalTime);
      } else {
        await database.runAsync('DELETE FROM plan_time_overrides WHERE cycle_id = ? AND local_date = ?;', edit.cycleId, edit.localDate);
      }
    } else if (edit.cycleId) {
      await database.runAsync('DELETE FROM plan_overrides WHERE cycle_id = ? AND local_date = ?;', edit.cycleId, edit.localDate);
    }
    if (edit.status === null) {
      await database.runAsync('DELETE FROM work_day_statuses WHERE local_date = ?;', edit.localDate);
    } else {
      await database.runAsync(`INSERT INTO work_day_statuses(local_date, status, note, updated_at_utc) VALUES (?, ?, ?, ?)
        ON CONFLICT(local_date) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at_utc = excluded.updated_at_utc;`,
        edit.localDate, edit.status, edit.note, edit.updatedAtUtc);
    }
  });
}
