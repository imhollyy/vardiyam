import { segmentWorkRecord } from '../../domain/work-segmentation.ts';

export type TrendMode = 'day' | 'week' | 'month';
export type TrendRecord = {
  record: { startedAtUtc: string; endedAtUtc: string; timezone: string; breakMinutes: number };
  timedBreaks: readonly { startedAtUtc: string; endedAtUtc: string }[];
};
export type TrendBucket = { label: string; workedMinutes: number; uncertainRecords: number };

export function buildWorkTrend(records: readonly TrendRecord[], start: string, endExclusive: string, mode: TrendMode): TrendBucket[] {
  const count = mode === 'day' ? 1 : mode === 'week' ? 7 : 5;
  const buckets = Array.from({ length: count }, (_, index) => ({
    label: mode === 'day' ? start.slice(5) : mode === 'week' ? ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'][index]! : `${index * 7 + 1}–${index === 4 ? 31 : index * 7 + 7}`,
    workedMinutes: 0,
    uncertainRecords: 0,
  }));
  for (const item of records) {
    let segments;
    try { segments = segmentWorkRecord(item.record, { breakIntervals: item.timedBreaks.length ? item.timedBreaks : undefined }).segments; }
    catch { continue; }
    for (const segment of segments) {
      if (segment.localDate < start || segment.localDate >= endExclusive) continue;
      let index = 0;
      if (mode === 'week') {
        const days = Math.floor((Date.parse(`${segment.localDate}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
        index = Math.max(0, Math.min(6, days));
      } else if (mode === 'month') index = Math.min(4, Math.floor((Number(segment.localDate.slice(-2)) - 1) / 7));
      if (segment.workedMinutes === null) buckets[index]!.uncertainRecords += 1;
      else buckets[index]!.workedMinutes += segment.workedMinutes;
    }
  }
  return buckets;
}
