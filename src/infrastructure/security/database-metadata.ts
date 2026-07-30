import {
  access,
  open,
  readFile,
  rename,
  stat,
} from 'node:fs/promises';
import { constants } from 'node:fs';

import { FinanceHubError, ERROR_CODES } from '../../shared/errors';
import {
  encryptionFormatFor,
  type EncryptionFormat,
} from './encryption-format';

const MAX_METADATA_BYTES = 16 * 1024;
const METADATA_KEYS = [
  'formatVersion',
  'kdfVersion',
  'salt',
  'keyVerifier',
] as const;

export interface DatabasePaths {
  readonly databasePath: string;
  readonly metadataPath: string;
  readonly databaseCreatingPath: string;
  readonly metadataCreatingPath: string;
}

export interface EncryptionMetadata {
  readonly formatVersion: number;
  readonly kdfVersion: number;
  readonly salt: {
    readonly encoding: 'base64';
    readonly value: string;
  };
  readonly keyVerifier: {
    readonly version: 1;
    readonly algorithm: 'HMAC-SHA-256';
    readonly encoding: 'base64';
    readonly value: string;
  };
}

export interface ParsedMetadata {
  readonly metadata: EncryptionMetadata;
  readonly format: EncryptionFormat;
  readonly salt: Buffer;
  readonly verifier: Buffer;
}

export type DatabaseFileState = 'new' | 'ready';

export function databasePaths(databasePath: string): DatabasePaths {
  const metadataPath = `${databasePath}.metadata.json`;
  return {
    databasePath,
    metadataPath,
    databaseCreatingPath: `${databasePath}.creating`,
    metadataCreatingPath: `${metadataPath}.creating`,
  };
}

export async function inspectDatabaseFiles(
  paths: DatabasePaths,
): Promise<DatabaseFileState> {
  const [databaseExists, metadataExists, databaseCreating, metadataCreating] =
    await Promise.all([
      exists(paths.databasePath),
      exists(paths.metadataPath),
      exists(paths.databaseCreatingPath),
      exists(paths.metadataCreatingPath),
    ]);

  if (databaseExists && !metadataExists) {
    throw new FinanceHubError(
      ERROR_CODES.databaseMetadataMissing,
      '資料庫存在，但 metadata 檔案遺失。',
    );
  }
  if (!databaseExists && metadataExists) {
    throw new FinanceHubError(
      ERROR_CODES.databaseFileMissing,
      'metadata 存在，但資料庫檔案遺失。',
    );
  }
  if (!databaseExists && !metadataExists && (databaseCreating || metadataCreating)) {
    throw new FinanceHubError(
      ERROR_CODES.databaseSetupIncomplete,
      '偵測到未完成的資料庫設定。',
    );
  }
  if (databaseExists && metadataExists) {
    return 'ready';
  }

  return 'new';
}

export async function readEncryptionMetadata(
  metadataPath: string,
): Promise<ParsedMetadata> {
  const info = await stat(metadataPath);
  if (info.size > MAX_METADATA_BYTES) {
    throw invalidMetadata();
  }

  let value: unknown;
  try {
    value = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch {
    throw invalidMetadata();
  }

  const metadata = parseMetadata(value);
  const format = encryptionFormatFor(
    metadata.formatVersion,
    metadata.kdfVersion,
  );
  if (!format) {
    throw new FinanceHubError(
      ERROR_CODES.unsupportedEncryptionFormat,
      '加密格式版本高於或不在此版本支援範圍。',
    );
  }

  const salt = decodeFixedBase64(
    metadata.salt.value,
    format.saltLength,
  );
  const verifier = decodeFixedBase64(
    metadata.keyVerifier.value,
    32,
  );

  return { metadata, format, salt, verifier };
}

export async function writeEncryptionMetadataAtomically(
  paths: DatabasePaths,
  metadata: EncryptionMetadata,
): Promise<void> {
  const serialized = `${JSON.stringify(metadata, null, 2)}\n`;
  const file = await open(
    paths.metadataCreatingPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );

  try {
    await file.writeFile(serialized, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }

  await rename(paths.metadataCreatingPath, paths.metadataPath);
}

function parseMetadata(value: unknown): EncryptionMetadata {
  if (!isExactObject(value, METADATA_KEYS)) {
    throw invalidMetadata();
  }
  if (
    !Number.isInteger(value.formatVersion) ||
    !Number.isInteger(value.kdfVersion) ||
    !isExactObject(value.salt, ['encoding', 'value']) ||
    value.salt.encoding !== 'base64' ||
    typeof value.salt.value !== 'string' ||
    !isExactObject(value.keyVerifier, [
      'version',
      'algorithm',
      'encoding',
      'value',
    ]) ||
    value.keyVerifier.version !== 1 ||
    value.keyVerifier.algorithm !== 'HMAC-SHA-256' ||
    value.keyVerifier.encoding !== 'base64' ||
    typeof value.keyVerifier.value !== 'string'
  ) {
    throw invalidMetadata();
  }

  return value as unknown as EncryptionMetadata;
}

function isExactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function decodeFixedBase64(value: string, length: number): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.length !== length ||
    decoded.toString('base64') !== value
  ) {
    decoded.fill(0);
    throw invalidMetadata();
  }
  return decoded;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function invalidMetadata(): FinanceHubError {
  return new FinanceHubError(
    ERROR_CODES.invalidDatabaseMetadata,
    'metadata 檔案格式不正確。',
  );
}
