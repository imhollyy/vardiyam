import {
  addCalendarDays,
  dayOrdinal,
  getProjectedRange,
  type ShiftCycle,
  type ShiftTemplate,
  validateShiftCycle,
  validateShiftTemplate,
} from '../../domain/shift-cycle/index.ts';
import { buildShiftSchedule, previewShiftSchedule, type CustomEntryDraft, type ScheduleDraft, type ShiftPattern } from '../shifts/schedule.ts';

export type SavedScheduleDraft = {
  version: 1;
  pattern: ShiftPattern | null;
  anchorLocalDate: string;
  startTemplateIndex: number;
  startEntryIndex: number;
  cycleId: string;
  templates: ShiftTemplate[];
  customEntries: CustomEntryDraft[];
  baseline: { cycle: ShiftCycle; templates: ShiftTemplate[] } | null;
  baselinePatternUnknown: boolean;
};

const FALLBACK_TEMPLATES = [
  { name: 'Gündüz', startLocalTime: '08:00', endLocalTime: '16:00' },
  { name: 'Akşam', startLocalTime: '16:00', endLocalTime: '00:00' },
  { name: 'Gece', startLocalTime: '00:00', endLocalTime: '08:00' },
];

export function ensureScheduleTemplates(draft: SavedScheduleDraft, stored: readonly ShiftTemplate[]): SavedScheduleDraft {
  const templates = [...draft.templates];
  const ids = new Set([...stored, ...templates].map((item) => item.id));
  const codes = new Set([...stored, ...templates].map((item) => item.code.toLocaleUpperCase('en')));
  while (templates.length < 3) {
    const index = templates.length;
    const base = FALLBACK_TEMPLATES[index]!;
    let suffix = 1;
    let id = `${draft.cycleId}-setup-${index}`;
    let code = `SETUP-${index}`;
    while (ids.has(id) || codes.has(code.toLocaleUpperCase('en'))) {
      suffix += 1;
      id = `${draft.cycleId}-setup-${index}-${suffix}`;
      code = `SETUP-${index}-${suffix}`;
    }
    ids.add(id); codes.add(code.toLocaleUpperCase('en'));
    templates.push({ ...base, id, code });
  }
  return { ...draft, templates };
}

export function scheduleDraftFromCycle(cycle: ShiftCycle, allTemplates: readonly ShiftTemplate[]): SavedScheduleDraft {
  const templateIds = [...new Set(cycle.entries.flatMap((entry) => entry.kind === 'SHIFT' ? [entry.templateId] : []))];
  const templates = templateIds.map((id) => {
    const template = allTemplates.find((candidate) => candidate.id === id);
    if (!template) throw new Error('Kayıtlı döngünün vardiya şablonu bulunamadı. Mevcut düzen korunuyor.');
    return { ...template };
  });
  const templateIndex = new Map(templates.map((template, index) => [template.id, index]));
  const customEntries = cycle.entries.map((entry): CustomEntryDraft => entry.kind === 'OFF'
    ? { kind: 'OFF' }
    : { kind: 'SHIFT', templateIndex: templateIndex.get(entry.templateId)! });
  const startEntry = cycle.entries[cycle.startIndex];
  return {
    version: 1,
    // The database stores the actual sequence, not the original preset name.
    // Reopen it as that exact sequence instead of guessing a named preset.
    pattern: 'custom', anchorLocalDate: cycle.anchorLocalDate,
    startTemplateIndex: Math.max(0, startEntry?.kind === 'SHIFT' ? templateIndex.get(startEntry.templateId) ?? 0 : 0),
    startEntryIndex: cycle.startIndex, cycleId: cycle.id,
    templates, customEntries,
    baseline: { cycle: { ...cycle, entries: cycle.entries.map((entry) => ({ ...entry })) }, templates: templates.map((template) => ({ ...template })) },
    baselinePatternUnknown: true,
  };
}

export function validateSavedScheduleDraft(value: unknown): value is SavedScheduleDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<SavedScheduleDraft>;
  try { if (typeof draft.anchorLocalDate !== 'string') return false; dayOrdinal(draft.anchorLocalDate); }
  catch { return false; }
  if (!(draft.version === 1 &&
    (draft.pattern === null || (typeof draft.pattern === 'string' && ['fixed', 'weekly-three', 'two-two-two', 'four-two', 'six-one', 'custom'].includes(draft.pattern))) &&
    typeof draft.anchorLocalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.anchorLocalDate) &&
    Number.isInteger(draft.startTemplateIndex) && (draft.startTemplateIndex ?? -1) >= 0 &&
    Number.isInteger(draft.startEntryIndex) && (draft.startEntryIndex ?? -1) >= 0 &&
    typeof draft.cycleId === 'string' && draft.cycleId.length > 0 &&
    Array.isArray(draft.templates) && draft.templates.every((template) => template && typeof template.id === 'string' && typeof template.name === 'string' && typeof template.code === 'string' && typeof template.startLocalTime === 'string' && typeof template.endLocalTime === 'string') &&
    Array.isArray(draft.customEntries) && draft.customEntries.every((entry) => entry && (entry.kind === 'OFF' || (entry.kind === 'SHIFT' && typeof entry.templateIndex === 'number' && Number.isInteger(entry.templateIndex) && entry.templateIndex >= 0 && entry.templateIndex < (draft.templates?.length ?? 0)))) &&
    typeof draft.baselinePatternUnknown === 'boolean')) return false;
  if (draft.baseline === null) return true;
  if (!draft.baseline || !Array.isArray(draft.baseline.templates)) return false;
  try {
    for (const template of draft.baseline.templates) validateShiftTemplate(template);
    validateShiftCycle(draft.baseline.cycle, draft.baseline.templates);
    return true;
  } catch { return false; }
}

export function scheduleDraftForBuild(draft: SavedScheduleDraft): ScheduleDraft {
  if (!draft.pattern) throw new Error('Önce bir çalışma düzeni seç.');
  if (!draft.templates[draft.startTemplateIndex]) throw new Error('Başlangıç vardiyası seçilmelidir.');
  return {
    id: draft.cycleId, name: 'Vardiya düzenim', timezone: 'Europe/Istanbul',
    anchorLocalDate: draft.anchorLocalDate, pattern: draft.pattern,
    startTemplateIndex: draft.startTemplateIndex, startEntryIndex: draft.startEntryIndex,
    preservedStartEntryIndex: draft.startEntryIndex,
    templates: draft.templates, customEntries: draft.customEntries,
  };
}

export function previewNext30Days(draft: SavedScheduleDraft, today: string) {
  return previewShiftSchedule(scheduleDraftForBuild(draft), today, 30);
}

function daySignature(kind: string, templateId: string | undefined, templates: readonly ShiftTemplate[]): string {
  if (kind !== 'SHIFT') return kind;
  const template = templates.find((item) => item.id === templateId);
  return template ? [kind, template.id, template.name, template.startLocalTime, template.endLocalTime].join('|') : 'MISSING_TEMPLATE';
}

/** Conservative warning check: true means prior plan presentation could change. */
export function changesHistoricalPlan(draft: SavedScheduleDraft, today: string): boolean {
  if (!draft.baseline) return false;
  const candidate = buildShiftSchedule(scheduleDraftForBuild(draft));
  const previous = draft.baseline;
  const firstDate = dayOrdinal(previous.cycle.anchorLocalDate) < dayOrdinal(candidate.cycle.anchorLocalDate)
    ? previous.cycle.anchorLocalDate : candidate.cycle.anchorLocalDate;
  const yesterday = addCalendarDays(today, -1);
  if (dayOrdinal(firstDate) > dayOrdinal(yesterday)) return false;
  const days = dayOrdinal(yesterday) - dayOrdinal(firstDate) + 1;
  // If the span exceeds the projection engine bound, fail safely and require confirmation.
  if (days > 3660) return true;
  try {
    const oldDays = getProjectedRange(previous.cycle, previous.templates, firstDate, yesterday);
    const newDays = getProjectedRange(candidate.cycle, candidate.templates, firstDate, yesterday);
    return oldDays.some((day, index) => daySignature(day.kind, day.templateId, previous.templates) !==
      daySignature(newDays[index]!.kind, newDays[index]!.templateId, candidate.templates));
  } catch {
    return true;
  }
}

export function requiredTemplateIds(draft: SavedScheduleDraft): Set<string> {
  const built = buildShiftSchedule(scheduleDraftForBuild(draft));
  return new Set(built.cycle.entries.flatMap((entry) => entry.kind === 'SHIFT' ? [entry.templateId] : []));
}
