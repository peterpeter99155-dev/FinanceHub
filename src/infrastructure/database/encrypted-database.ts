import { randomBytes } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';

import { FinanceHubError, ERROR_CODES } from '../../shared/errors';
import {
  bootstrapDatabaseConnection,
  type BootstrapDatabase,
} from './bootstrap-database';
import {
  openSqliteDatabase,
  type SqliteDatabase,
} from './sqlite-database';
import {
  createKeyVerifier,
  deriveKeys,
  keyVerifierMatches,
} from '../security/key-derivation';
import {
  currentEncryptionFormat,
  type EncryptionFormat,
} from '../security/encryption-format';
import {
  databasePaths,
  inspectDatabaseFiles,
  readEncryptionMetadata,
  writeEncryptionMetadataAtomically,
  type DatabasePaths,
  type EncryptionMetadata,
} from '../security/database-metadata';

export async function openOrCreateEncryptedDatabase(
  databasePath: string,
  password: string,
): Promise<BootstrapDatabase> {
  const paths = databasePaths(databasePath);
  const state = await inspectDatabaseFiles(paths);
  if (state === 'new') {
    return createEncryptedDatabase(paths, password);
  }
  return openEncryptedDatabase(paths, password);
}

export async function openExistingEncryptedDatabase(
  databasePath: string,
  password: string,
): Promise<BootstrapDatabase> {
  const paths = databasePaths(databasePath);
  const state = await inspectDatabaseFiles(paths);
  if (state !== 'ready') {
    throw new FinanceHubError(
      ERROR_CODES.databaseFileMissing,
      '尚未建立加密資料庫。',
    );
  }
  return openEncryptedDatabase(paths, password);
}

async function createEncryptedDatabase(
  paths: DatabasePaths,
  password: string,
): Promise<BootstrapDatabase> {
  const format = currentEncryptionFormat();
  const salt = randomBytes(format.saltLength);
  const keys = await deriveKeys(password, salt, format);
  const verifier = createKeyVerifier(keys.verifierKey);
  keys.verifierKey.fill(0);
  const metadata = createMetadata(format, salt, verifier);
  let temporaryDatabase: SqliteDatabase | undefined;
  let metadataPromoted = false;
  let databasePromoted = false;

  try {
    temporaryDatabase = openCipherDatabase(
      paths.databaseCreatingPath,
      keys.databaseKey,
      format,
    );
    bootstrapDatabaseConnection(temporaryDatabase);
    temporaryDatabase.close();
    temporaryDatabase = undefined;

    await writeEncryptionMetadataAtomically(paths, metadata);
    metadataPromoted = true;
    await rename(paths.databaseCreatingPath, paths.databasePath);
    databasePromoted = true;

    const database = openCipherDatabase(
      paths.databasePath,
      keys.databaseKey,
      format,
    );
    verifyReadableDatabase(database);
    bootstrapDatabaseConnection(database);
    return asBootstrapDatabase(database);
  } catch (error) {
    temporaryDatabase?.close();
    await removeTemporaryDatabase(paths);
    if (metadataPromoted && !databasePromoted) {
      await rm(paths.metadataPath, { force: true });
    }
    throw error;
  } finally {
    salt.fill(0);
    verifier.fill(0);
    keys.databaseKey.fill(0);
  }
}

async function openEncryptedDatabase(
  paths: DatabasePaths,
  password: string,
): Promise<BootstrapDatabase> {
  const parsed = await readEncryptionMetadata(paths.metadataPath);
  const keys = await deriveKeys(password, parsed.salt, parsed.format);
  const actualVerifier = createKeyVerifier(keys.verifierKey);
  keys.verifierKey.fill(0);

  try {
    if (!keyVerifierMatches(parsed.verifier, actualVerifier)) {
      throw new FinanceHubError(
        ERROR_CODES.wrongPassword,
        '主密碼錯誤。',
      );
    }

    const database = openCipherDatabase(
      paths.databasePath,
      keys.databaseKey,
      parsed.format,
    );
    try {
      verifyReadableDatabase(database);
      bootstrapDatabaseConnection(database);
      return asBootstrapDatabase(database);
    } catch {
      database.close();
      throw new FinanceHubError(
        ERROR_CODES.databaseUnreadable,
        '主密碼正確，但資料庫已損壞或無法讀取。',
      );
    }
  } finally {
    parsed.salt.fill(0);
    parsed.verifier.fill(0);
    actualVerifier.fill(0);
    keys.databaseKey.fill(0);
  }
}

function openCipherDatabase(
  databasePath: string,
  databaseKey: Buffer,
  format: EncryptionFormat,
): SqliteDatabase {
  const database = openSqliteDatabase(databasePath);
  const rawKey = encodeRawKey(databaseKey);

  try {
    database.pragma(`cipher = '${format.cipher.name}'`);
    database.pragma(`legacy = ${format.cipher.legacy}`);
    database.pragma(
      `plaintext_header_size = ${format.cipher.plaintextHeaderSize}`,
    );
    database.pragma(`hmac_check = ${format.cipher.hmacCheck}`);
    database.pragma(`page_size = ${format.cipher.pageSize}`);
    database.key(rawKey);
    return database;
  } catch (error) {
    database.close();
    throw error;
  } finally {
    rawKey.fill(0);
  }
}

function encodeRawKey(key: Buffer): Buffer {
  const prefix = Buffer.from('raw:', 'ascii');
  const alphabet = Buffer.from('0123456789abcdef', 'ascii');
  const encoded = Buffer.alloc(prefix.length + key.length * 2);
  prefix.copy(encoded);

  for (let index = 0; index < key.length; index += 1) {
    encoded[prefix.length + index * 2] = alphabet[key[index] >> 4];
    encoded[prefix.length + index * 2 + 1] =
      alphabet[key[index] & 0x0f];
  }

  return encoded;
}

function verifyReadableDatabase(database: SqliteDatabase): void {
  database
    .prepare('SELECT COUNT(*) AS count FROM sqlite_master')
    .get();
}

function asBootstrapDatabase(
  database: SqliteDatabase,
): BootstrapDatabase {
  return {
    database,
    close: () => database.close(),
  };
}

function createMetadata(
  format: EncryptionFormat,
  salt: Buffer,
  verifier: Buffer,
): EncryptionMetadata {
  return {
    formatVersion: format.formatVersion,
    kdfVersion: format.kdfVersion,
    salt: {
      encoding: 'base64',
      value: salt.toString('base64'),
    },
    keyVerifier: {
      version: 1,
      algorithm: 'HMAC-SHA-256',
      encoding: 'base64',
      value: verifier.toString('base64'),
    },
  };
}

async function removeTemporaryDatabase(
  paths: DatabasePaths,
): Promise<void> {
  await Promise.all([
    rm(paths.databaseCreatingPath, { force: true }),
    rm(`${paths.databaseCreatingPath}-wal`, { force: true }),
    rm(`${paths.databaseCreatingPath}-shm`, { force: true }),
    rm(`${paths.databaseCreatingPath}-journal`, { force: true }),
    rm(paths.metadataCreatingPath, { force: true }),
  ]);
}
