import type { SQLiteDatabase } from 'expo-sqlite';

import {
  segmentWorkRecord,
  type WorkSegmentationOptions,
  type WorkSegmentationResult,
} from '../domain/work-segmentation.ts';
import { getWorkRecordWithTimedBreaks } from './workRecordRepository.ts';

/** Reads one consistent repository snapshot and forwards only explicitly timed breaks. */
export async function segmentStoredWorkRecord(
  database: Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'>,
  id: string,
  options: Omit<WorkSegmentationOptions, 'breakIntervals'> = {},
): Promise<WorkSegmentationResult | null> {
  const stored = await getWorkRecordWithTimedBreaks(database, id);
  if (!stored) return null;
  const { record, timedBreaks } = stored;
  return segmentWorkRecord(record, timedBreaks.length > 0 ? { ...options, breakIntervals: timedBreaks } : options);
}
