import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';

import { validateBackupDatabase } from '../../src/data/backupValidation.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { recoverDatabaseState, parseRecoveryMarker } from '../../src/features/backup/recoveryEngine.ts';

const LIVE = 'vardiyam.db';
const STAGE = 'vdy-stage-0123456789abcdef.db';
const ROLLBACK = 'vdy-rollback-0123456789abcdef.db';
const MARKER = 'maintenance.json';

function adapter(sqlite) {
  return {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); },
    async withTransactionAsync(callback) {
      sqlite.exec('BEGIN;');
      try { await callback(); sqlite.exec('COMMIT;'); }
      catch (error) { sqlite.exec('ROLLBACK;'); throw error; }
    },
  };
}

async function openReference() {
  const sqlite = new DatabaseSync(':memory:');
  return { database: adapter(sqlite), close: async () => sqlite.close() };
}

async function createV8(path, value = null) {
  const sqlite = new DatabaseSync(path);
  const db = adapter(sqlite);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await initializeDatabase(db);
  if (value !== null) await db.runAsync('INSERT INTO app_metadata (key,value) VALUES (?,?);', 'synthetic_recovery_fixture', value);
  const validation = await validateBackupDatabase(db, { createReferenceDatabase: openReference, expectedSchemaVersion: 8 });
  const image = sqlite.serialize();
  const digest = hex(sha256(image));
  image.fill(0);
  sqlite.close();
  return { digest, count: validation.recordCount, value };
}

function hex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }

function fixtureMarker(candidate, rollback, state = 'committed') {
  return {
    version: 2,
    state,
    stageName: STAGE,
    rollbackName: ROLLBACK,
    candidateDigest: candidate.digest,
    candidateRecordCount: candidate.count,
    rollbackDigest: rollback.digest,
    rollbackRecordCount: rollback.count,
  };
}

async function createHarness(t) {
  const directory = await mkdtemp(join(tmpdir(), 'vdy010a-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const path = (name) => join(directory, name);
  const portFor = (marker, { failCleanupOnce = false, failAfterRestoreOnce = false } = {}) => {
    let failedCleanup = false;
    let failedRestore = false;
    return {
      async recover() {
        const parsed = parseRecoveryMarker(await readFile(path(MARKER), 'utf8'));
        return recoverDatabaseState(LIVE, parsed, {
          liveExists: await exists(path(LIVE)),
          rollbackExists: await exists(path(parsed.rollbackName)),
          verifyCandidate: (name, data) => verify(path(name), data.candidateDigest, data.candidateRecordCount),
          verifyRollback: (name, data) => verify(path(name), data.rollbackDigest, data.rollbackRecordCount),
          verifyLiveAsRollback: (data) => verify(path(LIVE), data.rollbackDigest, data.rollbackRecordCount),
          restoreRollback: async (rollbackName, liveName) => {
            await rm(path(liveName), { force: true });
            await copyFile(path(rollbackName), path(liveName));
            if (failAfterRestoreOnce && !failedRestore) { failedRestore = true; throw new Error('simulated process stop after copy'); }
          },
          cleanupStaging: async (stageName, rollbackName) => {
            await rm(path(stageName), { force: true });
            await rm(path(rollbackName), { force: true });
          },
          cleanupCommitted: async (stageName, rollbackName) => {
            await rm(path(stageName), { force: true });
            if (failCleanupOnce && !failedCleanup) { failedCleanup = true; throw new Error('simulated disk cleanup failure'); }
            await rm(path(rollbackName), { force: true });
          },
          deleteMarker: () => rm(path(MARKER), { force: true }),
        });
      },
      marker,
      path,
    };
  };
  return { directory, path, portFor };
}

async function exists(path) { try { await readFile(path); return true; } catch { return false; } }

async function verify(path, digest, expectedCount) {
  let sqlite;
  try {
    sqlite = new DatabaseSync(path);
    const db = adapter(sqlite);
    const result = await validateBackupDatabase(db, { createReferenceDatabase: openReference, expectedSchemaVersion: 8 });
    const image = sqlite.serialize();
    const actualDigest = hex(sha256(image));
    image.fill(0);
    return result.recordCount === expectedCount && actualDigest === digest;
  } catch { return false; }
  finally { sqlite?.close(); }
}

async function writeMarker(path, marker) { await writeFile(path, JSON.stringify(marker)); }

test('committed recovery verifies the candidate before deleting the old rollback copy', async (t) => {
  const h = await createHarness(t);
  const old = await createV8(h.path(ROLLBACK), 'old-data');
  const candidate = await createV8(h.path(STAGE), 'new-data');
  await copyFile(h.path(STAGE), h.path(LIVE));
  const marker = fixtureMarker(candidate, old);
  await writeMarker(h.path(MARKER), marker);
  const run = h.portFor(marker);

  assert.equal(await run.recover(), 'finish-commit');
  assert.equal(await exists(h.path(ROLLBACK)), false);
  assert.equal(await exists(h.path(MARKER)), false);
  const live = new DatabaseSync(h.path(LIVE));
  assert.equal(live.prepare("SELECT value FROM app_metadata WHERE key='synthetic_recovery_fixture';").get().value, 'new-data');
  live.close();
});

test('committed all-data wipe validates empty v8 candidate while retaining rollback until validation', async (t) => {
  const h = await createHarness(t);
  const old = await createV8(h.path(ROLLBACK), 'old-data');
  const empty = await createV8(h.path(STAGE));
  assert.equal(empty.count, 0);
  await copyFile(h.path(STAGE), h.path(LIVE));
  const marker = fixtureMarker(empty, old);
  await writeMarker(h.path(MARKER), marker);
  const run = h.portFor(marker);

  assert.equal(await run.recover(), 'finish-commit');
  const live = new DatabaseSync(h.path(LIVE));
  assert.equal(live.prepare('PRAGMA user_version;').get().user_version, 8);
  assert.equal(live.prepare('SELECT COUNT(*) AS count FROM app_metadata;').get().count, 0);
  live.close();
  assert.equal(await exists(h.path(ROLLBACK)), false);
});

test('corrupt committed live database is replaced from verified rollback and survives a second startup', async (t) => {
  const h = await createHarness(t);
  const old = await createV8(h.path(ROLLBACK), 'old-data');
  const candidate = await createV8(h.path(STAGE), 'new-data');
  await writeFile(h.path(LIVE), Buffer.from('corrupt live sqlite bytes'));
  const marker = fixtureMarker(candidate, old);
  await writeMarker(h.path(MARKER), marker);
  const run = h.portFor(marker, { failAfterRestoreOnce: true });

  await assert.rejects(run.recover());
  assert.equal(await exists(h.path(ROLLBACK)), true);
  const restored = new DatabaseSync(h.path(LIVE));
  assert.equal(restored.prepare("SELECT value FROM app_metadata WHERE key='synthetic_recovery_fixture';").get().value, 'old-data');
  restored.close();

  assert.equal(await run.recover(), 'finish-rollback');
  assert.equal(await exists(h.path(ROLLBACK)), false);
  assert.equal(await exists(h.path(MARKER)), false);
});

test('missing or corrupt rollback fails closed without changing a corrupt live database', async (t) => {
  for (const rollbackKind of ['missing', 'corrupt']) {
    await t.test(rollbackKind, async (t2) => {
      const h = await createHarness(t2);
      const old = { digest: '0'.repeat(64), count: 1 };
      const candidate = await createV8(h.path(STAGE), 'new-data');
      const liveBytes = Buffer.from('damaged-live');
      await writeFile(h.path(LIVE), liveBytes);
      if (rollbackKind === 'corrupt') await writeFile(h.path(ROLLBACK), Buffer.from('damaged-rollback'));
      const marker = fixtureMarker(candidate, old);
      await writeMarker(h.path(MARKER), marker);
      const run = h.portFor(marker);
      await assert.rejects(run.recover());
      assert.deepEqual(await readFile(h.path(LIVE)), liveBytes);
      assert.equal(await exists(h.path(MARKER)), true);
      assert.equal(await exists(h.path(STAGE)), true);
    });
  }
});

test('recovery retries after cleanup failure and after a stop during rollback copy', async (t) => {
  const h = await createHarness(t);
  const old = await createV8(join(h.directory, 'cleanup-old.db'), 'old-data');
  const candidate = await createV8(h.path(STAGE), 'new-data');
  await copyFile(join(h.directory, 'cleanup-old.db'), h.path(ROLLBACK));
  await copyFile(h.path(STAGE), h.path(LIVE));
  const marker = fixtureMarker(candidate, old);
  await writeMarker(h.path(MARKER), marker);
  const cleanupRun = h.portFor(marker, { failCleanupOnce: true });
  await assert.rejects(cleanupRun.recover());
  assert.equal(await exists(h.path(MARKER)), true);
  assert.equal(await cleanupRun.recover(), 'finish-commit');
  assert.equal(await exists(h.path(ROLLBACK)), false);

  // A second fixture simulates process termination after restoring bytes but before clearing the marker.
  const secondOld = await createV8(join(h.directory, 'old.db'), 'old-again');
  const secondCandidate = await createV8(join(h.directory, 'candidate.db'), 'candidate-again');
  await copyFile(join(h.directory, 'old.db'), h.path(ROLLBACK));
  await writeFile(h.path(LIVE), Buffer.from('corrupt live'));
  const secondMarker = fixtureMarker(secondCandidate, secondOld);
  await writeMarker(h.path(MARKER), secondMarker);
  const interrupted = h.portFor(secondMarker, { failAfterRestoreOnce: true });
  await assert.rejects(interrupted.recover());
  assert.equal(await exists(h.path(ROLLBACK)), true);
  assert.equal(await interrupted.recover(), 'finish-rollback');
  const live = new DatabaseSync(h.path(LIVE));
  assert.equal(live.prepare("SELECT value FROM app_metadata WHERE key='synthetic_recovery_fixture';").get().value, 'old-again');
  live.close();
});

test('corrupt marker is rejected without touching database files', async (t) => {
  const h = await createHarness(t);
  await writeFile(h.path(LIVE), Buffer.from('leave untouched'));
  await writeFile(h.path(MARKER), '{broken');
  await assert.rejects(readFile(h.path(MARKER), 'utf8').then(parseRecoveryMarker));
  assert.deepEqual(await readFile(h.path(LIVE)), Buffer.from('leave untouched'));
});
