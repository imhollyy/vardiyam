import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { computeLogicalDigest } from '../../src/data/logicalDigest.ts';
import { initializeDatabase } from '../../src/data/database.ts';
import { resetAllData } from '../../src/data/resetRepository.ts';

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

test('computeLogicalDigest: aynı veri aynı özeti üretir', async () => {
  const sqlite1 = new DatabaseSync(':memory:');
  const sqlite2 = new DatabaseSync(':memory:');
  try {
    const db1 = adapter(sqlite1);
    const db2 = adapter(sqlite2);
    await initializeDatabase(db1);
    await initializeDatabase(db2);

    // Add identical data to both
    for (const sqlite of [sqlite1, sqlite2]) {
      sqlite.exec(`
        INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time) VALUES ('t1', 'G', 'Gündüz', '08:00', '16:00');
        UPDATE settings SET salary_minor = 300000 WHERE id = 1;
      `);
    }

    const digest1 = await computeLogicalDigest(db1);
    const digest2 = await computeLogicalDigest(db2);
    assert.equal(digest1, digest2);
    assert.match(digest1, /^[0-9a-f]{64}$/);
  } finally { sqlite1.close(); sqlite2.close(); }
});

test('computeLogicalDigest: tek hücre farklılığı farklı özet üretir', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = adapter(sqlite);
    await initializeDatabase(db);

    const digestBefore = await computeLogicalDigest(db);

    sqlite.exec(`UPDATE settings SET salary_minor = 100 WHERE id = 1;`);

    const digestAfter = await computeLogicalDigest(db);
    assert.notEqual(digestBefore, digestAfter);
  } finally { sqlite.close(); }
});

test('computeLogicalDigest: sıfırlama özeti değiştirir', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = adapter(sqlite);
    await initializeDatabase(db);

    sqlite.exec(`
      INSERT INTO shift_templates (id, code, name, start_local_time, end_local_time) VALUES ('t1', 'G', 'Gündüz', '08:00', '16:00');
      UPDATE settings SET salary_minor = 500000 WHERE id = 1;
    `);

    const digestBefore = await computeLogicalDigest(db);

    await resetAllData(db);

    const digestAfter = await computeLogicalDigest(db);
    assert.notEqual(digestBefore, digestAfter);
    assert.match(digestAfter, /^[0-9a-f]{64}$/);
  } finally { sqlite.close(); }
});
