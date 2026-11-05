import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, pbkdf2 } from 'node:crypto';
import test from 'node:test';

import {
  BACKUP_FORMAT_VERSION,
  BACKUP_KDF_ITERATIONS,
  createEncryptedBackup,
  decryptEncryptedBackup,
  inspectEncryptedBackup,
} from '../../src/features/backup/backupContainer.ts';

function nodeCrypto() {
  let sequence = 0;
  return {
    async randomBytes(length) {
      sequence += 1;
      return Uint8Array.from({ length }, (_, index) => (sequence * 41 + index * 13) & 255);
    },
    deriveKey(password, salt, iterations) {
      return new Promise((resolve, reject) => pbkdf2(password, salt, iterations, 32, 'sha256', (error, key) => error ? reject(error) : resolve(new Uint8Array(key))));
    },
    async encrypt(plaintext, key, nonce, aad) {
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad);
      return Uint8Array.from(Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]));
    },
    async decrypt(ciphertextWithTag, key, nonce, aad) {
      const data = Buffer.from(ciphertextWithTag);
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(data.subarray(-16));
      return Uint8Array.from(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]));
    },
  };
}

test('encrypted backup uses a versioned authenticated envelope and round-trips binary database bytes', async () => {
  const crypto = nodeCrypto();
  const databaseBytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 0, 13]);
  const backup = await createEncryptedBackup(databaseBytes, {
    databaseSchemaVersion: 6,
    sqliteVersion: '3.49.1',
    createdAtUtc: '2026-11-05T12:00:00.000Z',
  }, 'uzun ve guclu yedek parolasi 2026', crypto);
  const preview = await inspectEncryptedBackup(backup);
  const restored = await decryptEncryptedBackup(backup, 'uzun ve guclu yedek parolasi 2026', crypto);

  assert.equal(BACKUP_FORMAT_VERSION, 1);
  assert.equal(BACKUP_KDF_ITERATIONS, 600_000);
  assert.equal(preview.databaseSchemaVersion, 6);
  assert.equal(preview.sqliteVersion, '3.49.1');
  assert.deepEqual(restored.databaseBytes, databaseBytes);
});

test('wrong password and ciphertext tampering fail authenticated decryption without exposing details', async () => {
  const crypto = nodeCrypto();
  const backup = await createEncryptedBackup(new Uint8Array([1, 2, 3]), {
    databaseSchemaVersion: 6,
    sqliteVersion: '3.49.1',
  }, 'uzun ve guclu yedek parolasi 2026', crypto);

  await assert.rejects(
    decryptEncryptedBackup(backup, 'baska bir parola guclu 2026', crypto),
    /Parola yanlış veya yedek bozuk/,
  );
  const tampered = backup.slice();
  tampered[tampered.length - 1] ^= 0x80;
  await assert.rejects(
    decryptEncryptedBackup(tampered, 'uzun ve guclu yedek parolasi 2026', crypto),
    /Parola yanlış veya yedek bozuk/,
  );
});

test('backup parser rejects missing, truncated, future, and inconsistent files before decryption', async () => {
  const crypto = nodeCrypto();
  const backup = await createEncryptedBackup(new Uint8Array([9, 8, 7]), {
    databaseSchemaVersion: 6,
    sqliteVersion: '3.49.1',
  }, 'uzun ve guclu yedek parolasi 2026', crypto);

  await assert.rejects(inspectEncryptedBackup(new Uint8Array()), /eksik|boyut/);
  await assert.rejects(inspectEncryptedBackup(backup.slice(0, -1)), /eksik|bozuk/);
  const futureVersion = backup.slice();
  const headerLength = (futureVersion[8] << 8) | futureVersion[9];
  const headerStart = 10;
  const header = JSON.parse(new TextDecoder().decode(futureVersion.slice(headerStart, headerStart + headerLength)));
  header.formatVersion = 99;
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const malformed = new Uint8Array(10 + headerBytes.length + 4 + backup.length - (10 + headerLength + 4));
  malformed.set(futureVersion.slice(0, 8));
  malformed[8] = headerBytes.length >> 8;
  malformed[9] = headerBytes.length & 0xff;
  malformed.set(headerBytes, 10);
  malformed.set(futureVersion.slice(10 + headerLength), 10 + headerBytes.length);
  await assert.rejects(inspectEncryptedBackup(malformed), /biçimi veya sürümü/);
});

test('backup password policy rejects short and oversized passwords', async () => {
  const crypto = nodeCrypto();
  const metadata = { databaseSchemaVersion: 6, sqliteVersion: '3.49.1' };
  await assert.rejects(createEncryptedBackup(new Uint8Array([1]), metadata, 'çok kısa', crypto), /12–128/);
  await assert.rejects(createEncryptedBackup(new Uint8Array([1]), metadata, 'x'.repeat(129), crypto), /12–128/);
});
