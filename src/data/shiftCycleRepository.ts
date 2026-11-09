import type { SQLiteDatabase } from 'expo-sqlite';

import {
  dayOrdinal,
  getProjectedDay,
  getProjectedRange,
  getProjectedRangeDayCount,
  validatePlanOverrides,
  validateShiftCycle,
  validateShiftTemplate,
  type LocalDate,
  type PlanOverride,
  type PlannedShift,
  type ShiftCycle,
  type ShiftTemplate,
} from '../domain/shift-cycle/index.ts';
import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type ShiftCycleDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'
>;

export type ShiftStorageErrorCode =
  | 'DATABASE_NOT_INITIALIZED'
  | 'DATABASE_INTEGRITY_ERROR'
  | 'NOT_FOUND'
  | 'TEMPLATE_IN_USE'
  | 'CYCLE_HAS_OVERRIDES';

export class ShiftStorageError extends Error {
  readonly code: ShiftStorageErrorCode;

  constructor(code: ShiftStorageErrorCode, message: string) {
    super(message);
    this.name = 'ShiftStorageError';
    this.code = code;
  }
}

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  start_local_time: string;
  end_local_time: string;
  color_token: string | null;
  icon_key: string | null;
};

type CycleRow = {
  id: string;
  name: string;
  timezone: string;
  anchor_local_date: LocalDate;
  start_index: number;
  entry_count: number;
};

type EntryRow = {
  position: number;
  kind: 'SHIFT' | 'OFF';
  template_id: string | null;
};

type OverrideRow = {
  local_date: LocalDate;
  kind: 'SHIFT' | 'OFF' | 'LEAVE';
  template_id: string | null;
  reason: string | null;
};
type PlanTimeRow = { local_date: LocalDate; start_local_time: string; end_local_time: string };

const TEMPLATE_SELECT =
  'SELECT id, code, name, start_local_time, end_local_time, color_token, icon_key FROM shift_templates';

async function assertForeignKeysEnabled(database: ShiftCycleDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  if (!row || row.foreign_keys !== 1) {
    throw new ShiftStorageError(
      'DATABASE_NOT_INITIALIZED',
      'Call initializeDatabase before using shift storage so foreign keys are enabled.',
    );
  }
}

function fromTemplateRow(row: TemplateRow): ShiftTemplate {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    startLocalTime: row.start_local_time,
    endLocalTime: row.end_local_time,
    ...(row.color_token === null ? {} : { colorToken: row.color_token }),
    ...(row.icon_key === null ? {} : { iconKey: row.icon_key }),
  };
}

async function listShiftTemplatesInternal(
  database: ShiftCycleDatabase,
): Promise<ShiftTemplate[]> {
  const rows = await database.getAllAsync<TemplateRow>(TEMPLATE_SELECT + ' ORDER BY id;');
  return rows.map(fromTemplateRow);
}

async function getShiftTemplateInternal(
  database: ShiftCycleDatabase,
  id: string,
): Promise<ShiftTemplate | null> {
  const row = await database.getFirstAsync<TemplateRow>(
    TEMPLATE_SELECT + ' WHERE id = ?;',
    id,
  );
  return row ? fromTemplateRow(row) : null;
}

function fromOverrideRow(row: OverrideRow): PlanOverride {
  if (row.kind === 'SHIFT') {
    if (row.template_id === null) {
      throw new ShiftStorageError(
        'DATABASE_INTEGRITY_ERROR',
        'Stored SHIFT override is missing its template reference.',
      );
    }

    return {
      localDate: row.local_date,
      kind: 'SHIFT',
      templateId: row.template_id,
      ...(row.reason === null ? {} : { reason: row.reason }),
    };
  }

  if (row.template_id !== null) {
    throw new ShiftStorageError(
      'DATABASE_INTEGRITY_ERROR',
      'Stored OFF or LEAVE override unexpectedly references a template.',
    );
  }

  return {
    localDate: row.local_date,
    kind: row.kind,
    ...(row.reason === null ? {} : { reason: row.reason }),
  };
}

async function listPlanOverridesInternal(
  database: ShiftCycleDatabase,
  cycleId: string,
  startLocalDate?: LocalDate,
  endLocalDate?: LocalDate,
): Promise<PlanOverride[]> {
  if ((startLocalDate === undefined) !== (endLocalDate === undefined)) {
    throw new Error('Both override range dates must be provided together.');
  }

  const rows =
    startLocalDate === undefined
      ? await database.getAllAsync<OverrideRow>(
          'SELECT local_date, kind, template_id, reason FROM plan_overrides ' +
            'WHERE cycle_id = ? ORDER BY local_date;',
          cycleId,
        )
      : await database.getAllAsync<OverrideRow>(
          'SELECT local_date, kind, template_id, reason FROM plan_overrides ' +
            'WHERE cycle_id = ? AND local_date >= ? AND local_date <= ? ORDER BY local_date;',
          cycleId,
          startLocalDate,
          endLocalDate as LocalDate,
        );

  return rows.map(fromOverrideRow);
}

async function attachPlanTimes(database: ShiftCycleDatabase, cycleId: string, shifts: PlannedShift[], templates: readonly ShiftTemplate[]): Promise<PlannedShift[]> {
  if (!shifts.length) return shifts;
  const rows = await database.getAllAsync<PlanTimeRow>(
    'SELECT local_date, start_local_time, end_local_time FROM plan_time_overrides WHERE cycle_id = ? AND local_date >= ? AND local_date <= ?;',
    cycleId, shifts[0]!.localDate, shifts.at(-1)!.localDate,
  );
  const times = new Map(rows.map((row) => [row.local_date, row]));
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  return shifts.map((shift) => {
    if (shift.kind !== 'SHIFT' || !shift.templateId) return shift;
    const template = templatesById.get(shift.templateId);
    if (!template) return shift;
    const override = times.get(shift.localDate);
    return override ? { ...shift, startLocalTime: override.start_local_time, endLocalTime: override.end_local_time } : shift;
  });
}

async function getShiftCycleInternal(
  database: ShiftCycleDatabase,
  id: string,
): Promise<ShiftCycle | null> {
  const row = await database.getFirstAsync<CycleRow>(
    'SELECT id, name, timezone, anchor_local_date, start_index, entry_count ' +
      'FROM shift_cycles WHERE id = ?;',
    id,
  );
  if (!row) {
    return null;
  }

  const entryRows = await database.getAllAsync<EntryRow>(
    'SELECT position, kind, template_id FROM cycle_entries WHERE cycle_id = ? ORDER BY position;',
    id,
  );

  if (
    !Number.isInteger(row.entry_count) ||
    row.entry_count < 1 ||
    entryRows.length !== row.entry_count ||
    entryRows.some((entry, index) => entry.position !== index)
  ) {
    throw new ShiftStorageError(
      'DATABASE_INTEGRITY_ERROR',
      'Stored cycle entries do not match the declared ordered entry count.',
    );
  }

  const entries = entryRows.map((entry) => {
    if (entry.kind === 'OFF' && entry.template_id === null) {
      return { kind: 'OFF' as const };
    }
    if (entry.kind === 'SHIFT' && entry.template_id !== null) {
      return { kind: 'SHIFT' as const, templateId: entry.template_id };
    }

    throw new ShiftStorageError(
      'DATABASE_INTEGRITY_ERROR',
      'Stored cycle entry has an invalid kind/template combination.',
    );
  });

  const cycle: ShiftCycle = {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    anchorLocalDate: row.anchor_local_date,
    startIndex: row.start_index,
    entries,
  };
  validateShiftCycle(cycle, await listShiftTemplatesInternal(database));
  return cycle;
}

async function insertCycleEntries(
  database: ShiftCycleDatabase,
  cycle: ShiftCycle,
): Promise<void> {
  for (let position = 0; position < cycle.entries.length; position += 1) {
    const entry = cycle.entries[position];
    await database.runAsync(
      'INSERT INTO cycle_entries (cycle_id, position, kind, template_id) VALUES (?, ?, ?, ?);',
      cycle.id,
      position,
      entry.kind,
      entry.kind === 'SHIFT' ? entry.templateId : null,
    );
  }
}

async function ensureCycleExists(database: ShiftCycleDatabase, cycleId: string): Promise<void> {
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM shift_cycles WHERE id = ?;',
    cycleId,
  );
  if (!row) {
    throw new ShiftStorageError('NOT_FOUND', 'Shift cycle was not found.');
  }
}

export async function createShiftTemplate(
  database: ShiftCycleDatabase,
  template: ShiftTemplate,
): Promise<void> {
  validateShiftTemplate(template);
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    await database.runAsync(
      'INSERT INTO shift_templates ' +
        '(id, code, name, start_local_time, end_local_time, color_token, icon_key) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?);',
      template.id,
      template.code,
      template.name,
      template.startLocalTime,
      template.endLocalTime,
      template.colorToken ?? null,
      template.iconKey ?? null,
    );
  });
}

export async function getShiftTemplate(
  database: ShiftCycleDatabase,
  id: string,
): Promise<ShiftTemplate | null> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    return getShiftTemplateInternal(database, id);
  });
}

export async function listShiftTemplates(
  database: ShiftCycleDatabase,
): Promise<ShiftTemplate[]> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    return listShiftTemplatesInternal(database);
  });
}

export async function updateShiftTemplate(
  database: ShiftCycleDatabase,
  template: ShiftTemplate,
): Promise<void> {
  validateShiftTemplate(template);
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const result = await database.runAsync(
      'UPDATE shift_templates SET code = ?, name = ?, start_local_time = ?, end_local_time = ?, ' +
        'color_token = ?, icon_key = ? WHERE id = ?;',
      template.code,
      template.name,
      template.startLocalTime,
      template.endLocalTime,
      template.colorToken ?? null,
      template.iconKey ?? null,
      template.id,
    );
    if (result.changes !== 1) {
      throw new ShiftStorageError('NOT_FOUND', 'Shift template was not found.');
    }
  });
}

export async function deleteShiftTemplate(
  database: ShiftCycleDatabase,
  id: string,
): Promise<boolean> {
  return withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const usage = await database.getFirstAsync<{ count: number }>(
      'SELECT (SELECT COUNT(*) FROM cycle_entries WHERE template_id = ?) + ' +
        '(SELECT COUNT(*) FROM plan_overrides WHERE template_id = ?) AS count;',
      id,
      id,
    );
    if ((usage?.count ?? 0) > 0) {
      throw new ShiftStorageError(
        'TEMPLATE_IN_USE',
        'Shift template is referenced by a cycle or plan override.',
      );
    }

    const result = await database.runAsync('DELETE FROM shift_templates WHERE id = ?;', id);
    return result.changes === 1;
  });
}

export async function createShiftCycle(
  database: ShiftCycleDatabase,
  cycle: ShiftCycle,
): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    validateShiftCycle(cycle, await listShiftTemplatesInternal(database));
    await database.runAsync(
      'INSERT INTO shift_cycles (id, name, timezone, anchor_local_date, start_index, entry_count) ' +
        'VALUES (?, ?, ?, ?, ?, ?);',
      cycle.id,
      cycle.name,
      cycle.timezone,
      cycle.anchorLocalDate,
      cycle.startIndex,
      cycle.entries.length,
    );
    await insertCycleEntries(database, cycle);
  });
}

/** Saves the complete editor payload atomically while preserving the connection queue. */
export async function saveShiftSchedule(
  database: ShiftCycleDatabase,
  templates: readonly ShiftTemplate[],
  cycle: ShiftCycle,
): Promise<void> {
  validateShiftCycle(cycle, templates);

  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);

    for (const template of templates) {
      validateShiftTemplate(template);
      await database.runAsync(
        'INSERT INTO shift_templates ' +
          '(id, code, name, start_local_time, end_local_time, color_token, icon_key) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, ' +
          'start_local_time = excluded.start_local_time, end_local_time = excluded.end_local_time, ' +
          'color_token = excluded.color_token, icon_key = excluded.icon_key;',
        template.id,
        template.code,
        template.name,
        template.startLocalTime,
        template.endLocalTime,
        template.colorToken ?? null,
        template.iconKey ?? null,
      );
    }

    validateShiftCycle(cycle, await listShiftTemplatesInternal(database));
    const existing = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM shift_cycles WHERE id = ?;',
      cycle.id,
    );

    if (existing) {
      await database.runAsync(
        'UPDATE shift_cycles SET name = ?, timezone = ?, anchor_local_date = ?, ' +
          'start_index = ?, entry_count = ? WHERE id = ?;',
        cycle.name,
        cycle.timezone,
        cycle.anchorLocalDate,
        cycle.startIndex,
        cycle.entries.length,
        cycle.id,
      );
      await database.runAsync('DELETE FROM cycle_entries WHERE cycle_id = ?;', cycle.id);
    } else {
      await database.runAsync(
        'INSERT INTO shift_cycles (id, name, timezone, anchor_local_date, start_index, entry_count) ' +
          'VALUES (?, ?, ?, ?, ?, ?);',
        cycle.id,
        cycle.name,
        cycle.timezone,
        cycle.anchorLocalDate,
        cycle.startIndex,
        cycle.entries.length,
      );
    }

    await insertCycleEntries(database, cycle);
  });
}

export async function getShiftCycle(
  database: ShiftCycleDatabase,
  id: string,
): Promise<ShiftCycle | null> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    return getShiftCycleInternal(database, id);
  });
}

export async function listShiftCycles(database: ShiftCycleDatabase): Promise<ShiftCycle[]> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const rows = await database.getAllAsync<{ id: string }>(
      'SELECT id FROM shift_cycles ORDER BY id;',
    );
    const cycles: ShiftCycle[] = [];
    for (const row of rows) {
      const cycle = await getShiftCycleInternal(database, row.id);
      if (!cycle) {
        throw new ShiftStorageError('DATABASE_INTEGRITY_ERROR', 'Listed cycle disappeared.');
      }
      cycles.push(cycle);
    }
    return cycles;
  });
}

export async function updateShiftCycle(
  database: ShiftCycleDatabase,
  cycle: ShiftCycle,
): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    validateShiftCycle(cycle, await listShiftTemplatesInternal(database));
    const result = await database.runAsync(
      'UPDATE shift_cycles SET name = ?, timezone = ?, anchor_local_date = ?, ' +
        'start_index = ?, entry_count = ? WHERE id = ?;',
      cycle.name,
      cycle.timezone,
      cycle.anchorLocalDate,
      cycle.startIndex,
      cycle.entries.length,
      cycle.id,
    );
    if (result.changes !== 1) {
      throw new ShiftStorageError('NOT_FOUND', 'Shift cycle was not found.');
    }

    await database.runAsync('DELETE FROM cycle_entries WHERE cycle_id = ?;', cycle.id);
    await insertCycleEntries(database, cycle);
  });
}

export async function deleteShiftCycle(
  database: ShiftCycleDatabase,
  id: string,
): Promise<boolean> {
  return withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const overrides = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM plan_overrides WHERE cycle_id = ?;',
      id,
    );
    if ((overrides?.count ?? 0) > 0) {
      throw new ShiftStorageError(
        'CYCLE_HAS_OVERRIDES',
        'Delete this cycle day overrides before deleting the cycle.',
      );
    }

    const result = await database.runAsync('DELETE FROM shift_cycles WHERE id = ?;', id);
    return result.changes === 1;
  });
}

export async function createPlanOverride(
  database: ShiftCycleDatabase,
  cycleId: string,
  override: PlanOverride,
): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    await ensureCycleExists(database, cycleId);
    validatePlanOverrides([override], await listShiftTemplatesInternal(database));
    await database.runAsync(
      'INSERT INTO plan_overrides (cycle_id, local_date, kind, template_id, reason) ' +
        'VALUES (?, ?, ?, ?, ?);',
      cycleId,
      override.localDate,
      override.kind,
      override.kind === 'SHIFT' ? override.templateId : null,
      override.reason ?? null,
    );
  });
}

export async function getPlanOverride(
  database: ShiftCycleDatabase,
  cycleId: string,
  localDate: LocalDate,
): Promise<PlanOverride | null> {
  dayOrdinal(localDate);
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const row = await database.getFirstAsync<OverrideRow>(
      'SELECT local_date, kind, template_id, reason FROM plan_overrides ' +
        'WHERE cycle_id = ? AND local_date = ?;',
      cycleId,
      localDate,
    );
    return row ? fromOverrideRow(row) : null;
  });
}

export async function listPlanOverrides(
  database: ShiftCycleDatabase,
  cycleId: string,
): Promise<PlanOverride[]> {
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const overrides = await listPlanOverridesInternal(database, cycleId);
    validatePlanOverrides(overrides, await listShiftTemplatesInternal(database));
    return overrides;
  });
}

export async function updatePlanOverride(
  database: ShiftCycleDatabase,
  cycleId: string,
  previousLocalDate: LocalDate,
  override: PlanOverride,
): Promise<void> {
  dayOrdinal(previousLocalDate);
  await withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    await ensureCycleExists(database, cycleId);
    validatePlanOverrides([override], await listShiftTemplatesInternal(database));
    const result = await database.runAsync(
      'UPDATE plan_overrides SET local_date = ?, kind = ?, template_id = ?, reason = ? ' +
        'WHERE cycle_id = ? AND local_date = ?;',
      override.localDate,
      override.kind,
      override.kind === 'SHIFT' ? override.templateId : null,
      override.reason ?? null,
      cycleId,
      previousLocalDate,
    );
    if (result.changes !== 1) {
      throw new ShiftStorageError('NOT_FOUND', 'Plan override was not found.');
    }
  });
}

export async function deletePlanOverride(
  database: ShiftCycleDatabase,
  cycleId: string,
  localDate: LocalDate,
): Promise<boolean> {
  dayOrdinal(localDate);
  return withDatabaseTransaction(database, async () => {
    await assertForeignKeysEnabled(database);
    const result = await database.runAsync(
      'DELETE FROM plan_overrides WHERE cycle_id = ? AND local_date = ?;',
      cycleId,
      localDate,
    );
    return result.changes === 1;
  });
}

export async function getPlannedShiftForDate(
  database: ShiftCycleDatabase,
  cycleId: string,
  localDate: LocalDate,
): Promise<PlannedShift> {
  dayOrdinal(localDate);
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const cycle = await getShiftCycleInternal(database, cycleId);
    if (!cycle) {
      throw new ShiftStorageError('NOT_FOUND', 'Shift cycle was not found.');
    }
    const templates = await listShiftTemplatesInternal(database);
    const overrides = await listPlanOverridesInternal(database, cycleId, localDate, localDate);
    validatePlanOverrides(overrides, templates);
    const projected = getProjectedDay(cycle, templates, localDate, overrides);
    return (await attachPlanTimes(database, cycleId, [projected], templates))[0]!;
  });
}

export async function getPlannedShiftsForRange(
  database: ShiftCycleDatabase,
  cycleId: string,
  startLocalDate: LocalDate,
  endLocalDate: LocalDate,
): Promise<PlannedShift[]> {
  getProjectedRangeDayCount(startLocalDate, endLocalDate);
  return withDatabaseOperation(database, async () => {
    await assertForeignKeysEnabled(database);
    const cycle = await getShiftCycleInternal(database, cycleId);
    if (!cycle) {
      throw new ShiftStorageError('NOT_FOUND', 'Shift cycle was not found.');
    }
    const templates = await listShiftTemplatesInternal(database);
    const overrides = await listPlanOverridesInternal(
      database,
      cycleId,
      startLocalDate,
      endLocalDate,
    );
    validatePlanOverrides(overrides, templates);
    const projected = getProjectedRange(cycle, templates, startLocalDate, endLocalDate, overrides);
    return attachPlanTimes(database, cycleId, projected, templates);
  });
}

