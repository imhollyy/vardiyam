import type { SQLiteDatabase } from 'expo-sqlite';

import { withDatabaseOperation, withDatabaseTransaction } from './transactions.ts';

export type ThemePreference = 'light' | 'dark';

export type OnboardingState = { step: number; completed: boolean };
export type ReportsRewardState = { expiresAtUtc: string | null; lastUsedLocalDate: string | null };
const MAX_ONBOARDING_STEP = 6;

async function getMetadata(database: SQLiteDatabase, key: string): Promise<string | null> {
  return withDatabaseOperation(database, async () => {
    const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?;', key);
    return row?.value ?? null;
  });
}

async function saveMetadata(database: SQLiteDatabase, key: string, value: string): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await database.runAsync(`INSERT INTO app_metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, key, value);
  });
}

export async function getOnboardingState(database: SQLiteDatabase): Promise<OnboardingState> {
  return withDatabaseOperation(database, async () => {
    const stateRow = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'onboarding_state';");
    const completionRow = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'onboarding_completed';");
    let parsed: OnboardingState | null = null;
    if (stateRow?.value) {
      try {
        const value = JSON.parse(stateRow.value) as Partial<OnboardingState>;
        if (Number.isInteger(value.step) && (value.step ?? -1) >= 0 && (value.step ?? MAX_ONBOARDING_STEP + 1) <= MAX_ONBOARDING_STEP && typeof value.completed === 'boolean') {
          parsed = { step: value.step as number, completed: value.completed };
        }
      } catch { /* Invalid local preference is safely ignored. */ }
    }
    if (completionRow?.value === 'true' || parsed?.completed === true) {
      return { step: parsed?.step ?? 0, completed: true };
    }
    if (completionRow?.value === 'false') return { step: parsed?.step ?? 0, completed: false };

    // Legacy recovery: before completion was stored separately, configured users
    // could have had their completed flag overwritten by a wizard progress save.
    const existing = await database.getFirstAsync<{ configured: number }>(
      `SELECT EXISTS(SELECT 1 FROM shift_cycles) OR EXISTS(SELECT 1 FROM earnings_profiles)
        OR EXISTS(SELECT 1 FROM work_records) OR EXISTS(SELECT 1 FROM net_payments)
        OR EXISTS(SELECT 1 FROM earnings_snapshots) AS configured;`,
    );
    return { step: parsed?.step ?? 0, completed: existing?.configured === 1 };
  });
}

export async function saveOnboardingState(database: SQLiteDatabase, state: OnboardingState): Promise<void> {
  if (!Number.isInteger(state.step) || state.step < 0 || state.step > MAX_ONBOARDING_STEP) throw new Error('Onboarding step is invalid.');
  await withDatabaseTransaction(database, async () => {
    const stateRow = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'onboarding_state';");
    const completionRow = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'onboarding_completed';");
    let previousCompleted = false;
    if (stateRow?.value) {
      try { previousCompleted = (JSON.parse(stateRow.value) as Partial<OnboardingState>).completed === true; }
      catch { /* Corrupt progress metadata does not prevent safe completion recovery. */ }
    }
    let completed = state.completed || previousCompleted || completionRow?.value === 'true';
    if (!completed && completionRow?.value !== 'false') {
      const existing = await database.getFirstAsync<{ configured: number }>(
        `SELECT EXISTS(SELECT 1 FROM shift_cycles) OR EXISTS(SELECT 1 FROM earnings_profiles)
          OR EXISTS(SELECT 1 FROM work_records) OR EXISTS(SELECT 1 FROM net_payments)
          OR EXISTS(SELECT 1 FROM earnings_snapshots) AS configured;`,
      );
      completed = existing?.configured === 1;
    }
    const next = JSON.stringify({ step: state.step, completed });
    await database.runAsync(`INSERT INTO app_metadata (key, value) VALUES ('onboarding_state', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, next);
    await database.runAsync(`INSERT INTO app_metadata (key, value) VALUES ('onboarding_completed', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, String(completed));
  });
}

export async function getOnboardingScheduleDraft<T = unknown>(database: SQLiteDatabase): Promise<T | null> {
  const value = await getMetadata(database, 'onboarding_schedule_draft');
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export async function saveOnboardingScheduleDraft(database: SQLiteDatabase, draft: unknown): Promise<void> {
  let serialized: string;
  try { serialized = JSON.stringify(draft); } catch { throw new Error('Kurulum taslağı kaydedilemedi.'); }
  if (!serialized || serialized.length > 100_000) throw new Error('Kurulum taslağı geçersiz veya çok büyük.');
  await saveMetadata(database, 'onboarding_schedule_draft', serialized);
}

export async function clearOnboardingScheduleDraft(database: SQLiteDatabase): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await database.runAsync("DELETE FROM app_metadata WHERE key = 'onboarding_schedule_draft';");
  });
}

export async function getReportsRewardState(database: SQLiteDatabase): Promise<ReportsRewardState> {
  const value = await getMetadata(database, 'reports_reward');
  if (!value) return { expiresAtUtc: null, lastUsedLocalDate: null };
  try {
    const parsed = JSON.parse(value) as Partial<ReportsRewardState>;
    return {
      expiresAtUtc: typeof parsed.expiresAtUtc === 'string' ? parsed.expiresAtUtc : null,
      lastUsedLocalDate: typeof parsed.lastUsedLocalDate === 'string' ? parsed.lastUsedLocalDate : null,
    };
  } catch { return { expiresAtUtc: null, lastUsedLocalDate: null }; }
}

export async function saveReportsRewardState(database: SQLiteDatabase, state: ReportsRewardState): Promise<void> {
  await saveMetadata(database, 'reports_reward', JSON.stringify(state));
}

export async function getThemePreference(database: SQLiteDatabase): Promise<ThemePreference> {
  return withDatabaseOperation(database, async () => {
    const row = await database.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = 'theme_mode';",
    );
    return row?.value === 'dark' ? 'dark' : 'light';
  });
}

export async function saveThemePreference(
  database: SQLiteDatabase,
  preference: ThemePreference,
): Promise<void> {
  await withDatabaseTransaction(database, async () => {
    await database.runAsync(
      `INSERT INTO app_metadata (key, value) VALUES ('theme_mode', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      preference,
    );
  });
}
