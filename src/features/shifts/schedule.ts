import {
  addCalendarDays,
  createCustomShiftCycle,
  createFixedShiftCycle,
  createFourTwoCycle,
  createSixOneCycle,
  createTwoTwoTwoCycle,
  createWeeklyThreeShiftCycle,
  getProjectedRange,
  validateShiftCycle,
  type CycleEntry,
  type LocalDate,
  type ShiftCycle,
  type ShiftTemplate,
} from '../../domain/shift-cycle/index.ts';

export type ShiftPattern =
  | 'fixed'
  | 'weekly-three'
  | 'two-two-two'
  | 'four-two'
  | 'six-one'
  | 'custom';

export type CustomEntryDraft =
  | { kind: 'SHIFT'; templateIndex: number }
  | { kind: 'OFF' };

export type ScheduleDraft = {
  id: string;
  name: string;
  timezone: string;
  anchorLocalDate: LocalDate;
  pattern: ShiftPattern;
  startTemplateIndex: number;
  /** Explicit phase selection for custom cycles, including an OFF first entry. */
  startEntryIndex?: number;
  preservedStartEntryIndex?: number;
  templates: readonly ShiftTemplate[];
  customEntries: readonly CustomEntryDraft[];
};

export type BuiltSchedule = { templates: ShiftTemplate[]; cycle: ShiftCycle };

function templateAt(draft: ScheduleDraft, index: number): ShiftTemplate {
  const template = draft.templates[index];
  if (!template) {
    throw new Error('Seçilen vardiya şablonu bulunamadı.');
  }
  return template;
}

function threeTemplates(draft: ScheduleDraft): [ShiftTemplate, ShiftTemplate, ShiftTemplate] {
  return [templateAt(draft, 0), templateAt(draft, 1), templateAt(draft, 2)];
}

export function buildShiftSchedule(draft: ScheduleDraft): BuiltSchedule {
  const selectedTemplate = templateAt(draft, draft.startTemplateIndex);
  const base = {
    id: draft.id,
    name: draft.name.trim(),
    timezone: draft.timezone.trim(),
    anchorLocalDate: draft.anchorLocalDate.trim(),
    startIndex: 0,
  };

  let cycle: ShiftCycle;
  switch (draft.pattern) {
    case 'fixed':
      cycle = createFixedShiftCycle(base, selectedTemplate.id);
      break;
    case 'weekly-three':
      {
        const [first, second, third] = threeTemplates(draft);
        cycle = createWeeklyThreeShiftCycle(base, [first.id, second.id, third.id]);
      }
      cycle.startIndex = draft.startTemplateIndex * 7;
      break;
    case 'two-two-two':
      {
        const [first, second, third] = threeTemplates(draft);
        cycle = createTwoTwoTwoCycle(base, [first.id, second.id, third.id]);
      }
      cycle.startIndex = draft.startTemplateIndex * 2;
      break;
    case 'four-two':
      cycle = createFourTwoCycle(base, selectedTemplate.id);
      break;
    case 'six-one':
      cycle = createSixOneCycle(base, selectedTemplate.id);
      break;
    case 'custom': {
      const entries: CycleEntry[] = draft.customEntries.map((entry) =>
        entry.kind === 'OFF'
          ? { kind: 'OFF' }
          : { kind: 'SHIFT', templateId: templateAt(draft, entry.templateIndex).id },
      );
      cycle = createCustomShiftCycle(base, entries);
      const selectedStart = draft.startEntryIndex ?? draft.preservedStartEntryIndex ?? cycle.entries.findIndex(
        (entry) => entry.kind === 'SHIFT' && entry.templateId === selectedTemplate.id,
      );
      if (selectedStart < 0) {
        throw new Error('Başlangıç vardiyası özel düzende kullanılmalıdır.');
      }
      if (selectedStart >= cycle.entries.length) throw new Error('Döngü başlangıç günü bulunamadı.');
      cycle.startIndex = selectedStart;
      break;
    }
  }

  // Keep a saved cycle's exact phase when the edit preserves its start shift.
  if (draft.pattern !== 'custom') {
    const preservedStart = draft.preservedStartEntryIndex;
    const preservedEntry = preservedStart === undefined ? undefined : cycle.entries[preservedStart];
    if (preservedStart !== undefined && preservedEntry?.kind === 'SHIFT' && preservedEntry.templateId === selectedTemplate.id) {
      cycle.startIndex = preservedStart;
    }
  }

  validateShiftCycle(cycle, [...draft.templates]);
  return { templates: [...draft.templates], cycle };
}

export function previewShiftSchedule(
  draft: ScheduleDraft,
  startLocalDate: LocalDate,
  dayCount = 21,
) {
  const { templates, cycle } = buildShiftSchedule(draft);
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 31) {
    throw new Error('Önizleme tarihi veya uzunluğu geçersiz.');
  }
  const endLocalDate = addCalendarDays(startLocalDate, dayCount - 1);
  return getProjectedRange(cycle, templates, startLocalDate, endLocalDate);
}
