import type { ShiftTemplate } from './index.ts';

export type ShiftKind = 'day' | 'evening' | 'night' | 'leave';

export function shiftKindOf(
  template: Pick<ShiftTemplate, 'colorToken' | 'code' | 'startLocalTime'>,
): ShiftKind {
  const token = template.colorToken;
  if (token === 'day' || token === 'evening' || token === 'night' || token === 'leave') {
    return token;
  }
  const code = (template.code ?? '').toUpperCase();
  if (code === 'GC') return 'night';
  if (code === 'A') return 'evening';
  if (code === 'G' || code === 'S') return 'day';
  const h = Number(template.startLocalTime.split(':')[0] ?? '8');
  if (h >= 5 && h < 13) return 'day';
  if (h >= 13 && h < 20) return 'evening';
  return 'night';
}
