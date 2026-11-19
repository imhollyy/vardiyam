import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytesAsync,
} from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { BackupCrypto } from './backupContainer.ts';

export const expoBackupCrypto: BackupCrypto = {
  randomBytes: getRandomBytesAsync,
  deriveKey: (password, salt, iterations) => pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32 }),
  async encrypt(plaintext, keyBytes, nonce, aad) {
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = await aesEncryptAsync(plaintext, key, { nonce: { bytes: nonce }, additionalData: aad, tagLength: 16 });
    return sealed.ciphertext({ includeTag: true });
  },
  async decrypt(ciphertextWithTag, keyBytes, nonce, aad) {
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = AESSealedData.fromParts(nonce, ciphertextWithTag, 16);
    const plaintext = await aesDecryptAsync(sealed, key, { additionalData: aad });
    if (!(plaintext instanceof Uint8Array)) throw new Error('Yedek çözülemedi.');
    return plaintext;
  },
};
