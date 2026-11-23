import { sha256 } from '@noble/hashes/sha2.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { TABLES_BY_VERSION } from './backupValidation.ts';

type DigestDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync'>;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeLogicalDigest(database: DigestDatabase): Promise<string> {
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const version = versionRow?.user_version ?? 0;
  const tables = TABLES_BY_VERSION[version];
  if (!tables) throw new Error(`Tanımlanamayan şema sürümü: ${version}`);

  const hasher = sha256.create();
  const enc = new TextEncoder();

  for (const table of tables) {
    hasher.update(enc.encode(`TABLE:${table}\n`));
    const rows = await database.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${table}" ORDER BY rowid;`);
    for (const row of rows) {
      const keys = Object.keys(row).sort();
      for (const key of keys) {
        const value = row[key];
        const v = value === null || value === undefined ? '\x00' : String(value);
        hasher.update(enc.encode(`${key}=${v}\x00`));
      }
      hasher.update(enc.encode('\x01'));
    }
  }

  return toHex(hasher.digest());
}
