export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KDF_ITERATIONS = 600_000;
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const MAGIC = new TextEncoder().encode('VARDIYAM');
const MAX_HEADER_BYTES = 2_048;

export type BackupHeader = {
  format: 'vardiyam-encrypted-backup';
  formatVersion: number;
  databaseSchemaVersion: number;
  sqliteVersion: string;
  createdAtUtc: string;
  kdf: 'PBKDF2-HMAC-SHA256';
  iterations: number;
  saltHex: string;
  cipher: 'AES-256-GCM';
  nonceHex: string;
};

export type BackupCrypto = {
  randomBytes: (length: number) => Promise<Uint8Array>;
  deriveKey: (password: Uint8Array, salt: Uint8Array, iterations: number) => Promise<Uint8Array>;
  encrypt: (plaintext: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array) => Promise<Uint8Array>;
  decrypt: (ciphertextWithTag: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array) => Promise<Uint8Array>;
};

export type BackupPreview = Pick<BackupHeader, 'formatVersion' | 'databaseSchemaVersion' | 'sqliteVersion' | 'createdAtUtc'>;

export function validateBackupPassword(password: string): void {
  const normalized = password.normalize('NFKC');
  const length = Array.from(normalized).length;
  if (length < 12 || length > 128) throw new Error('Parola 12–128 karakter olmalıdır.');
}

export async function createEncryptedBackup(
  databaseBytes: Uint8Array,
  metadata: { databaseSchemaVersion: number; sqliteVersion: string; createdAtUtc?: string },
  password: string,
  crypto: BackupCrypto,
): Promise<Uint8Array> {
  validateBackupPassword(password);
  if (databaseBytes.length === 0 || databaseBytes.length > MAX_BACKUP_BYTES - 4_096) {
    throw new Error('Veritabanı yedeği desteklenen boyut sınırını aşıyor.');
  }
  if (!Number.isInteger(metadata.databaseSchemaVersion) || metadata.databaseSchemaVersion < 1 || metadata.databaseSchemaVersion > 6) {
    throw new Error('Desteklenmeyen veritabanı şema sürümü.');
  }
  const salt = await crypto.randomBytes(16);
  const nonce = await crypto.randomBytes(12);
  if (salt.length !== 16 || nonce.length !== 12) throw new Error('Güvenli rastgele değer üretilemedi.');
  const header: BackupHeader = {
    format: 'vardiyam-encrypted-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    databaseSchemaVersion: metadata.databaseSchemaVersion,
    sqliteVersion: metadata.sqliteVersion.slice(0, 32),
    createdAtUtc: metadata.createdAtUtc ?? new Date().toISOString(),
    kdf: 'PBKDF2-HMAC-SHA256',
    iterations: BACKUP_KDF_ITERATIONS,
    saltHex: toHex(salt),
    cipher: 'AES-256-GCM',
    nonceHex: toHex(nonce),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const aad = join([MAGIC, uint16(headerBytes.length), headerBytes]);
  const key = await crypto.deriveKey(new TextEncoder().encode(password.normalize('NFKC')), salt, BACKUP_KDF_ITERATIONS);
  try {
    if (key.length !== 32) throw new Error('Parola anahtarı üretilemedi.');
    const ciphertext = await crypto.encrypt(databaseBytes, key, nonce, aad);
    const result = join([aad, uint32(ciphertext.length), ciphertext]);
    if (result.length > MAX_BACKUP_BYTES) throw new Error('Oluşturulan yedek boyut sınırını aşıyor.');
    return result;
  } finally {
    key.fill(0);
  }
}

export async function inspectEncryptedBackup(bytes: Uint8Array): Promise<BackupPreview> {
  return parseContainer(bytes).header;
}

export async function decryptEncryptedBackup(
  bytes: Uint8Array,
  password: string,
  crypto: BackupCrypto,
): Promise<{ databaseBytes: Uint8Array; preview: BackupPreview }> {
  validateBackupPassword(password);
  const parsed = parseContainer(bytes);
  const salt = fromHex(parsed.header.saltHex);
  const nonce = fromHex(parsed.header.nonceHex);
  const key = await crypto.deriveKey(new TextEncoder().encode(password.normalize('NFKC')), salt, parsed.header.iterations);
  try {
    const databaseBytes = await crypto.decrypt(parsed.ciphertext, key, nonce, parsed.aad);
    if (databaseBytes.length === 0 || databaseBytes.length > MAX_BACKUP_BYTES) throw new Error('Yedek verisi bozuk.');
    return { databaseBytes, preview: parsed.header };
  } catch {
    throw new Error('Parola yanlış veya yedek bozuk.');
  } finally {
    key.fill(0);
  }
}

function parseContainer(bytes: Uint8Array): { header: BackupHeader; ciphertext: Uint8Array; aad: Uint8Array } {
  if (bytes.length < 64 || bytes.length > MAX_BACKUP_BYTES) throw new Error('Yedek dosyası eksik veya desteklenen boyutun dışında.');
  for (let i = 0; i < MAGIC.length; i += 1) if (bytes[i] !== MAGIC[i]) throw new Error('Bu dosya Vardiyam yedeği değil.');
  const headerLength = readUint16(bytes, MAGIC.length);
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) throw new Error('Yedek başlığı geçersiz.');
  const headerStart = MAGIC.length + 2;
  const lengthOffset = headerStart + headerLength;
  if (lengthOffset + 4 > bytes.length) throw new Error('Yedek dosyası kesilmiş.');
  let header: BackupHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(headerStart, lengthOffset))) as BackupHeader;
  } catch {
    throw new Error('Yedek başlığı okunamıyor.');
  }
  if (
    header.format !== 'vardiyam-encrypted-backup' || header.formatVersion !== BACKUP_FORMAT_VERSION ||
    !Number.isInteger(header.databaseSchemaVersion) || header.databaseSchemaVersion < 1 || header.databaseSchemaVersion > 6 ||
    typeof header.sqliteVersion !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(header.sqliteVersion) ||
    typeof header.createdAtUtc !== 'string' || !Number.isFinite(Date.parse(header.createdAtUtc)) ||
    header.kdf !== 'PBKDF2-HMAC-SHA256' || header.iterations !== BACKUP_KDF_ITERATIONS ||
    header.cipher !== 'AES-256-GCM' || fromHex(header.saltHex).length !== 16 || fromHex(header.nonceHex).length !== 12
  ) throw new Error('Yedek biçimi veya sürümü desteklenmiyor.');
  const ciphertextLength = readUint32(bytes, lengthOffset);
  const aad = bytes.slice(0, lengthOffset);
  const ciphertextStart = lengthOffset + 4;
  if (ciphertextLength < 16 || ciphertextLength > MAX_BACKUP_BYTES || ciphertextStart + ciphertextLength !== bytes.length) {
    throw new Error('Yedek dosyası eksik veya bozuk.');
  }
  return { header, ciphertext: bytes.slice(ciphertextStart), aad };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) throw new Error('Yedek başlığı geçersiz.');
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < result.length; index += 1) result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return result;
}

function uint16(value: number): Uint8Array { return new Uint8Array([value >>> 8, value & 0xff]); }
function uint32(value: number): Uint8Array { return new Uint8Array([value >>> 24, value >>> 16, value >>> 8, value]); }
function readUint16(bytes: Uint8Array, offset: number): number { return (bytes[offset]! << 8) | bytes[offset + 1]!; }
function readUint32(bytes: Uint8Array, offset: number): number { return (bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!; }
function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
