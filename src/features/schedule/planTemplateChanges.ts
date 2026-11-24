import type { ShiftTemplate } from '../../domain/shift-cycle/index.ts';

export type TemplateDraft = {
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  breakMinutes: number;
};

export type PlanTemplateChangesResult = {
  reuse: ShiftTemplate[];
  create: TemplateDraft[];
};

/**
 * Matches drafts to existing templates by (code, startLocalTime, endLocalTime, breakMinutes).
 * Templates that match are reused; unmatched drafts must be created.
 * Order of output mirrors the order of `drafts`.
 */
export function planTemplateChanges(
  drafts: readonly TemplateDraft[],
  existing: readonly ShiftTemplate[],
): PlanTemplateChangesResult {
  const reuse: ShiftTemplate[] = [];
  const create: TemplateDraft[] = [];

  for (const draft of drafts) {
    const match = existing.find(
      (t) =>
        t.code === draft.code &&
        t.startLocalTime === draft.startLocalTime &&
        t.endLocalTime === draft.endLocalTime &&
        t.breakMinutes === draft.breakMinutes,
    );
    if (match) {
      reuse.push(match);
    } else {
      create.push(draft);
    }
  }

  return { reuse, create };
}

/** Returns the template ID for each draft, mapping from planTemplateChanges result. */
export function resolveTemplateIds(
  drafts: readonly TemplateDraft[],
  result: PlanTemplateChangesResult,
  createdTemplates: readonly ShiftTemplate[],
): string[] {
  const reuseMap = new Map(
    result.reuse.map((t) => [`${t.code}|${t.startLocalTime}|${t.endLocalTime}|${t.breakMinutes}`, t.id]),
  );
  const createMap = new Map(
    createdTemplates.map((t) => [`${t.code}|${t.startLocalTime}|${t.endLocalTime}|${t.breakMinutes}`, t.id]),
  );

  return drafts.map((d) => {
    const key = `${d.code}|${d.startLocalTime}|${d.endLocalTime}|${d.breakMinutes}`;
    return reuseMap.get(key) ?? createMap.get(key) ?? '';
  });
}
