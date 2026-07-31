import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { ERROR_CODES, FinanceHubError } from '../../shared/errors';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DATABASE_FILE = 'financehub.db';
export const BACKUP_METADATA_FILE = 'financehub.db.metadata.json';
export const BACKUP_MANIFEST_FILE = 'manifest.json';

export interface BackupManifestV1 {
  readonly formatVersion: 1;
  readonly backupId: string;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly applicationVersion: string;
  readonly databaseSchemaVersion: number;
  readonly database: BackupFileRecord;
  readonly metadata: BackupFileRecord;
  readonly encryption: {
    readonly formatVersion: number;
    readonly kdfVersion: number;
  };
}

export interface BackupFileRecord {
  readonly file: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export function createBackupId(): string {
  return randomUUID();
}

export function backupDirectoryName(
  backupId: string,
  completedAt?: string,
): string {
  if (!completedAt) return `backup-${backupId}`;
  return `FinanceHub-backup-${readableTimestamp(completedAt)}-${backupId}`;
}

export function creatingDirectoryName(backupId: string): string {
  return `.creating-${backupId}`;
}

export function backupDirectoryMatches(
  directoryName: string,
  manifest: BackupManifestV1,
): boolean {
  const escapedId = manifest.backupId.replaceAll('-', '\\-');
  return directoryName === backupDirectoryName(manifest.backupId) ||
    new RegExp(
      `^FinanceHub-backup-\\d{4}-\\d{2}-\\d{2}_` +
      `\\d{2}-\\d{2}-\\d{2}-${escapedId}$`,
      'i',
    ).test(directoryName);
}

function readableTimestamp(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}_` +
    `${part('hour')}-${part('minute')}-${part('second')}`;
}

export async function describeBackupFile(
  filePath: string,
  file: string,
): Promise<BackupFileRecord> {
  const info = await stat(filePath);
  if (!info.isFile()) throw invalidBackupFormat();
  return {
    file,
    sizeBytes: info.size,
    sha256: await sha256File(filePath),
  };
}

export async function validateBackupDirectory(
  directory: string,
): Promise<BackupManifestV1> {
  await validateExactBackupEntries(directory);
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(path.join(directory, BACKUP_MANIFEST_FILE), 'utf8'),
    );
  } catch {
    throw invalidBackupFormat();
  }
  const manifest = parseBackupManifest(value);
  const [database, metadata] = await Promise.all([
    describeBackupFile(path.join(directory, manifest.database.file), manifest.database.file),
    describeBackupFile(path.join(directory, manifest.metadata.file), manifest.metadata.file),
  ]);
  if (!sameFileRecord(database, manifest.database) ||
      !sameFileRecord(metadata, manifest.metadata)) {
    throw invalidBackupFormat();
  }
  return manifest;
}

async function validateExactBackupEntries(directory: string): Promise<void> {
  try {
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw invalidBackupFormat();
    }
    const expected = new Set([
      BACKUP_DATABASE_FILE,
      BACKUP_METADATA_FILE,
      BACKUP_MANIFEST_FILE,
    ]);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.length !== expected.size) throw invalidBackupFormat();
    for (const entry of entries) {
      if (
        !expected.has(entry.name) ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        throw invalidBackupFormat();
      }
      const info = await lstat(path.join(directory, entry.name));
      if (!info.isFile() || info.isSymbolicLink()) {
        throw invalidBackupFormat();
      }
    }
  } catch (error) {
    if (
      error instanceof FinanceHubError &&
      error.code === ERROR_CODES.backupFormatInvalid
    ) {
      throw error;
    }
    throw invalidBackupFormat();
  }
}

export function parseBackupManifest(value: unknown): BackupManifestV1 {
  if (!isRecord(value) || value.formatVersion !== 1 ||
      typeof value.backupId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.backupId) ||
      !isIsoDate(value.createdAt) || !isIsoDate(value.completedAt) ||
      typeof value.applicationVersion !== 'string' ||
      !isPositiveInteger(value.databaseSchemaVersion) ||
      !isFileRecord(value.database, BACKUP_DATABASE_FILE) ||
      !isFileRecord(value.metadata, BACKUP_METADATA_FILE) ||
      !isRecord(value.encryption) ||
      !isPositiveInteger(value.encryption.formatVersion) ||
      !isPositiveInteger(value.encryption.kdfVersion)) {
    throw invalidBackupFormat();
  }
  return value as unknown as BackupManifestV1;
}

function isFileRecord(value: unknown, expectedFile: string): value is BackupFileRecord {
  return isRecord(value) && value.file === expectedFile &&
    Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) >= 0 &&
    typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256);
}

function sameFileRecord(left: BackupFileRecord, right: BackupFileRecord): boolean {
  return left.file === right.file && left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function invalidBackupFormat(): FinanceHubError {
  return new FinanceHubError(ERROR_CODES.backupFormatInvalid, '備份格式或雜湊驗證失敗。');
}
