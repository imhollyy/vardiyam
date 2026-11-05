import type { SQLiteDatabase } from 'expo-sqlite';

import type { EarningsCalculationResult } from '../domain/earnings.ts';
import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type EarningsDatabase = Pick<SQLiteDatabase,
  'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'>;

export type EarningsProfileVersion<TProfile = unknown, TRules = unknown> = {
  profileId: string;
  profileVersion: number;
  profile: TProfile;
  ruleVersionId: string;
  ruleVersion: number;
  rules: TRules;
  createdAtUtc: string;
};

export class EarningsStorageError extends Error {
  readonly code: 'INVALID_PROFILE' | 'INCOMPLETE_SNAPSHOT' | 'STALE_PREVIEW' | 'STALE_SOURCE' | 'DUPLICATE_SNAPSHOT' | 'NOT_FOUND';

  constructor(code: 'INVALID_PROFILE' | 'INCOMPLETE_SNAPSHOT' | 'STALE_PREVIEW' | 'STALE_SOURCE' | 'DUPLICATE_SNAPSHOT' | 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'EarningsStorageError';
    this.code = code;
  }
}

type ProfileRow = { id: string; version: number; created_at_utc: string; profile_json: string };
type RuleRow = { id: string; profile_id: string; profile_version: number; version: number; created_at_utc: string; rules_json: string };

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJson(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(sortJson(value));
  if (serialized === undefined) throw new EarningsStorageError('INVALID_PROFILE', 'Snapshot payload must be JSON serializable.');
  return serialized;
}

function isCanonicalUtcMinute(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function decodeVersion<TProfile, TRules>(profile: ProfileRow, rules: RuleRow): EarningsProfileVersion<TProfile, TRules> {
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    profile: JSON.parse(profile.profile_json) as TProfile,
    ruleVersionId: rules.id,
    ruleVersion: rules.version,
    rules: JSON.parse(rules.rules_json) as TRules,
    createdAtUtc: profile.created_at_utc,
  };
}

async function getLatestRows(database: EarningsDatabase, profileId: string): Promise<{ profile: ProfileRow; rules: RuleRow } | null> {
  const profile = await database.getFirstAsync<ProfileRow>(
    'SELECT id, version, created_at_utc, profile_json FROM earnings_profiles WHERE id = ? ORDER BY version DESC LIMIT 1;', profileId,
  );
  if (!profile) return null;
  const rules = await database.getFirstAsync<RuleRow>(
    'SELECT id, profile_id, profile_version, version, created_at_utc, rules_json FROM earnings_rule_versions WHERE profile_id = ? ORDER BY version DESC LIMIT 1;', profileId,
  );
  if (!rules) throw new EarningsStorageError('INVALID_PROFILE', 'Profile exists without an earnings rule version.');
  return { profile, rules };
}

export async function getLatestEarningsProfile<TProfile = unknown, TRules = unknown>(
  database: EarningsDatabase,
  profileId = 'default',
): Promise<EarningsProfileVersion<TProfile, TRules> | null> {
  return withDatabaseOperation(database, async () => {
    const rows = await getLatestRows(database, profileId);
    return rows ? decodeVersion<TProfile, TRules>(rows.profile, rows.rules) : null;
  });
}

/** Appends a profile and matching rule set in one transaction; existing versions are never edited. */
export async function appendEarningsProfileVersion<TProfile, TRules>(
  database: EarningsDatabase,
  profileId: string,
  profile: TProfile,
  rules: TRules,
  ruleVersionId: string,
  createdAtUtc: string,
): Promise<EarningsProfileVersion<TProfile, TRules>> {
  if (!profileId.trim() || !ruleVersionId.trim() || !isCanonicalUtcMinute(createdAtUtc)) {
    throw new EarningsStorageError('INVALID_PROFILE', 'Profile identifiers and UTC creation time are required.');
  }
  const profileJson = canonicalJson(profile);
  const rulesJson = canonicalJson(rules);
  return withDatabaseTransaction(database, async () => {
    const current = await getLatestRows(database, profileId);
    const profileVersion = (current?.profile.version ?? 0) + 1;
    const ruleVersion = (current?.rules.version ?? 0) + 1;
    await database.runAsync(
      'INSERT INTO earnings_profiles(id, version, created_at_utc, profile_json) VALUES (?, ?, ?, ?);',
      profileId, profileVersion, createdAtUtc, profileJson,
    );
    await database.runAsync(
      'INSERT INTO earnings_rule_versions(id, profile_id, profile_version, version, created_at_utc, rules_json) VALUES (?, ?, ?, ?, ?, ?);',
      ruleVersionId, profileId, profileVersion, ruleVersion, createdAtUtc, rulesJson,
    );
    return { profileId, profileVersion, profile, ruleVersionId, ruleVersion, rules, createdAtUtc };
  });
}

export type ApprovedEarningsSnapshot = {
  calculationId: string;
  createdAtUtc: string;
  profileId: string;
  profileVersion: number;
  ruleVersionId: string;
  input: unknown;
  result: EarningsCalculationResult;
};

/** Explicitly-confirmed snapshots only. Preview callers do not call this API. */
export async function saveApprovedEarningsSnapshot(database: EarningsDatabase, item: ApprovedEarningsSnapshot): Promise<void> {
  if (!item.calculationId.trim() || !isCanonicalUtcMinute(item.createdAtUtc) || item.result.status !== 'COMPLETE' ||
      !item.result.snapshot || item.result.totalAmountMinor === null || !Number.isSafeInteger(item.result.totalAmountMinor) ||
      item.result.totalAmountMinor < 0 || item.result.snapshot.calculationId !== item.calculationId) {
    throw new EarningsStorageError('INCOMPLETE_SNAPSHOT', 'Only a complete, explicit, integer-minor-unit calculation can be saved.');
  }
  const snapshotLines = item.result.snapshot.lines;
  if (!snapshotLines.length || snapshotLines.some((line) => !Number.isSafeInteger(line.amountMinor) || (line.amountMinor ?? -1) < 0) ||
      snapshotLines.reduce((sum, line) => sum + BigInt(line.amountMinor ?? -1), 0n) !== BigInt(item.result.totalAmountMinor) ||
      item.result.snapshot.profileId !== item.profileId || item.result.snapshot.ruleSetVersionId !== item.ruleVersionId) {
    throw new EarningsStorageError('INCOMPLETE_SNAPSHOT', 'Approved snapshot lines and total must agree and belong to the selected profile.');
  }
  const inputJson = canonicalJson(item.input);
  const snapshotJson = canonicalJson({ totalAmountMinor: item.result.totalAmountMinor, snapshot: item.result.snapshot });
  const previewInput = item.input as { sourceRangeStartUtc?: string; sourceRangeEndUtc?: string; copiedSettings?: unknown; copiedRules?: unknown; records?: { id: string; startedAtUtc: string; endedAtUtc: string; timezone: string; breakMinutes: number; timedBreakIntervals?: { startedAtUtc: string; endedAtUtc: string }[] }[] };
  if (!previewInput || !isCanonicalUtcMinute(previewInput.sourceRangeStartUtc ?? '') || !isCanonicalUtcMinute(previewInput.sourceRangeEndUtc ?? '') ||
      Date.parse(previewInput.sourceRangeEndUtc ?? '') <= Date.parse(previewInput.sourceRangeStartUtc ?? '') || !Array.isArray(previewInput.records) ||
      previewInput.copiedSettings === undefined || previewInput.copiedRules === undefined) {
    throw new EarningsStorageError('INCOMPLETE_SNAPSHOT', 'Preview must include its full queried UTC range, source work records, and copied profile/rules.');
  }
  const sourceRangeStartUtc = previewInput.sourceRangeStartUtc!;
  const sourceRangeEndUtc = previewInput.sourceRangeEndUtc!;
  await withDatabaseTransaction(database, async () => {
    const latest = await getLatestRows(database, item.profileId);
    if (!latest || latest.profile.version !== item.profileVersion || latest.rules.id !== item.ruleVersionId) {
      throw new EarningsStorageError('STALE_PREVIEW', 'Profile or rule version changed; recalculate before approval.');
    }
    if (canonicalJson(previewInput.copiedSettings) !== latest.profile.profile_json || canonicalJson(previewInput.copiedRules) !== latest.rules.rules_json ||
        item.result.snapshot!.lines.some((line) => line.ruleSetVersionId !== item.result.snapshot!.ruleSetVersionId)) {
      throw new EarningsStorageError('STALE_PREVIEW', 'Copied input profile or rules do not match the selected immutable versions.');
    }
    const rows = await database.getAllAsync<{
      id: string; started_at_utc: string; ended_at_utc: string; timezone: string; break_minutes: number;
      break_started_at_utc: string | null; break_ended_at_utc: string | null;
    }>(`SELECT w.id, w.started_at_utc, w.ended_at_utc, w.timezone, w.break_minutes,
        b.started_at_utc AS break_started_at_utc, b.ended_at_utc AS break_ended_at_utc
      FROM work_records w LEFT JOIN break_intervals b ON b.work_record_id = w.id
      WHERE w.started_at_utc < ? AND w.ended_at_utc > ?
      ORDER BY w.id, b.started_at_utc, b.id;`, sourceRangeEndUtc, sourceRangeStartUtc);
    const currentRecords = new Map<string, { id: string; startedAtUtc: string; endedAtUtc: string; timezone: string; breakMinutes: number; timedBreakIntervals: { startedAtUtc: string; endedAtUtc: string }[] }>();
    for (const row of rows) {
      let current = currentRecords.get(row.id);
      if (!current) {
        current = { id: row.id, startedAtUtc: row.started_at_utc, endedAtUtc: row.ended_at_utc, timezone: row.timezone, breakMinutes: row.break_minutes, timedBreakIntervals: [] };
        currentRecords.set(row.id, current);
      }
      if (row.break_started_at_utc && row.break_ended_at_utc) current.timedBreakIntervals.push({ startedAtUtc: row.break_started_at_utc, endedAtUtc: row.break_ended_at_utc });
    }
    const normalizeRecords = (records: NonNullable<typeof previewInput.records>) => records.map((record) => ({
      id: record.id, startedAtUtc: record.startedAtUtc, endedAtUtc: record.endedAtUtc, timezone: record.timezone,
      breakMinutes: record.breakMinutes, timedBreakIntervals: [...(record.timedBreakIntervals ?? [])].sort((a, b) => a.startedAtUtc.localeCompare(b.startedAtUtc)),
    })).sort((a, b) => a.id.localeCompare(b.id));
    if (canonicalJson(normalizeRecords([...currentRecords.values()])) !== canonicalJson(normalizeRecords(previewInput.records))) {
      throw new EarningsStorageError('STALE_SOURCE', 'Work records or timed breaks changed after preview; recalculate before approval.');
    }
    try {
      await database.runAsync(
        `INSERT INTO earnings_snapshots(calculation_id, created_at_utc, profile_id, profile_version,
          rule_version_id, status, total_amount_minor, input_json, snapshot_json)
         VALUES (?, ?, ?, ?, ?, 'COMPLETE', ?, ?, ?);`,
        item.calculationId, item.createdAtUtc, item.profileId, item.profileVersion, item.ruleVersionId,
        item.result.totalAmountMinor, inputJson, snapshotJson,
      );
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new EarningsStorageError('DUPLICATE_SNAPSHOT', 'Calculation ID is already stored; saved snapshots cannot be replaced.');
      throw error;
    }
  });
}

export async function listApprovedEarningsSnapshots(database: EarningsDatabase, profileId = 'default'): Promise<ApprovedEarningsSnapshot[]> {
  return withDatabaseOperation(database, async () => {
    const rows = await database.getAllAsync<{
      calculation_id: string; created_at_utc: string; profile_id: string; profile_version: number;
      rule_version_id: string; input_json: string; snapshot_json: string;
    }>(`SELECT calculation_id, created_at_utc, profile_id, profile_version, rule_version_id, input_json, snapshot_json
        FROM earnings_snapshots WHERE profile_id = ? ORDER BY created_at_utc DESC, calculation_id DESC;`, profileId);
    return rows.map((row) => ({
      calculationId: row.calculation_id, createdAtUtc: row.created_at_utc, profileId: row.profile_id,
      profileVersion: row.profile_version, ruleVersionId: row.rule_version_id, input: JSON.parse(row.input_json),
        result: { status: 'COMPLETE', totalAmountMinor: JSON.parse(row.snapshot_json).totalAmountMinor,
        lines: JSON.parse(row.snapshot_json).snapshot.lines ?? [], uncertainties: [], snapshot: JSON.parse(row.snapshot_json).snapshot },
    }));
  });
}
