import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { ERROR_CODES, FinanceHubError } from '../../shared/errors';
import type { SqliteDatabase } from '../database/sqlite-database';
import type { DatabaseWriteGate } from '../main/database-write-gate';
import { readEncryptionMetadata } from '../security/database-metadata';
import {
  BACKUP_DATABASE_FILE,
  BACKUP_MANIFEST_FILE,
  BACKUP_METADATA_FILE,
  backupDirectoryName,
  createBackupId,
  creatingDirectoryName,
  describeBackupFile,
  validateBackupDirectory,
  type BackupManifestV1,
} from './backup-format';

interface CheckpointResult {
  readonly busy: number;
  readonly log: number;
  readonly checkpointed: number;
}

export class EncryptedBackupService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly databasePath: string,
    private readonly backupRoot: string,
    private readonly applicationVersion: string,
    private readonly gate: DatabaseWriteGate,
    private readonly now: () => Date = () => new Date(),
    private readonly makeBackupId: () => string = createBackupId,
  ) {}

  createBackup(): Promise<BackupManifestV1> {
    return this.gate.runBackup(async () => {
      try {
        return await this.createConsistentBackup();
      } catch (error) {
        if (error instanceof FinanceHubError) throw error;
        throw backupIoFailure();
      }
    });
  }

  async cleanupIncompleteBackups(): Promise<void> {
    await mkdir(this.backupRoot, { recursive: true });
    for (const entry of await readdir(this.backupRoot, { withFileTypes: true })) {
      if (!/^\.creating-[0-9a-f-]{36}$/i.test(entry.name)) continue;
      const candidate = path.join(this.backupRoot, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      await removeOwnedTemporaryDirectory(this.backupRoot, candidate);
    }
  }

  private async createConsistentBackup(): Promise<BackupManifestV1> {
    await assertRegularSourceFile(this.databasePath);
    await assertRegularSourceFile(`${this.databasePath}.metadata.json`);
    await mkdir(this.backupRoot, { recursive: true });
    await this.cleanupIncompleteBackups();

    const previousBusyTimeout = Number(
      this.database.pragma('busy_timeout', { simple: true }),
    );
    this.database.pragma('busy_timeout = 500');
    let checkpoint: CheckpointResult[];
    try {
      checkpoint = this.database.pragma(
        'wal_checkpoint(TRUNCATE)',
      ) as CheckpointResult[];
    } finally {
      this.database.pragma(`busy_timeout = ${previousBusyTimeout}`);
    }
    if (checkpoint.length !== 1 || checkpoint[0].busy !== 0) {
      throw new FinanceHubError(
        ERROR_CODES.backupCheckpointBusy,
        '資料庫目前忙碌，這次備份尚未建立。',
      );
    }

    const backupId = this.makeBackupId();
    const temporaryDirectory = path.join(
      this.backupRoot,
      creatingDirectoryName(backupId),
    );
    const completedDirectory = path.join(
      this.backupRoot,
      backupDirectoryName(backupId),
    );
    const createdAt = this.now().toISOString();

    try {
      await mkdir(temporaryDirectory, { recursive: false });
      const databaseTarget = path.join(temporaryDirectory, BACKUP_DATABASE_FILE);
      const metadataTarget = path.join(temporaryDirectory, BACKUP_METADATA_FILE);
      await copyAndSync(this.databasePath, databaseTarget);
      await copyAndSync(`${this.databasePath}.metadata.json`, metadataTarget);

      const parsedMetadata = await readEncryptionMetadata(metadataTarget);
      const schema = this.database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get() as { version?: number };
      if (!Number.isSafeInteger(schema.version) || Number(schema.version) <= 0) {
        throw new FinanceHubError(
          ERROR_CODES.backupSourceInvalid,
          '無法讀取資料庫 migration 版本。',
        );
      }
      const [database, metadata] = await Promise.all([
        describeBackupFile(databaseTarget, BACKUP_DATABASE_FILE),
        describeBackupFile(metadataTarget, BACKUP_METADATA_FILE),
      ]);
      const manifest: BackupManifestV1 = {
        formatVersion: 1,
        backupId,
        createdAt,
        completedAt: this.now().toISOString(),
        applicationVersion: this.applicationVersion,
        databaseSchemaVersion: schema.version!,
        database,
        metadata,
        encryption: {
          formatVersion: parsedMetadata.metadata.formatVersion,
          kdfVersion: parsedMetadata.metadata.kdfVersion,
        },
      };
      parsedMetadata.salt.fill(0);
      parsedMetadata.verifier.fill(0);

      const manifestPath = path.join(temporaryDirectory, BACKUP_MANIFEST_FILE);
      await writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
      await syncFile(manifestPath);
      await validateBackupDirectory(temporaryDirectory);
      await rename(temporaryDirectory, completedDirectory);
      return manifest;
    } catch (error) {
      await removeOwnedTemporaryDirectory(
        this.backupRoot,
        temporaryDirectory,
      ).catch(() => undefined);
      if (error instanceof FinanceHubError) throw error;
      throw backupIoFailure();
    }
  }
}

function backupIoFailure(): FinanceHubError {
  return new FinanceHubError(
    ERROR_CODES.backupIoFailure,
    '建立備份時發生檔案系統錯誤。',
  );
}

async function copyAndSync(source: string, target: string): Promise<void> {
  await copyFile(source, target, constants.COPYFILE_EXCL);
  await syncFile(target);
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertRegularSourceFile(filePath: string): Promise<void> {
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('not regular');
  } catch {
    throw new FinanceHubError(
      ERROR_CODES.backupSourceInvalid,
      '備份來源檔案不存在或不是一般檔案。',
    );
  }
}

async function removeOwnedTemporaryDirectory(
  root: string,
  candidate: string,
): Promise<void> {
  let info;
  try {
    info = await lstat(candidate);
  } catch {
    return;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) return;
  const [resolvedRoot, resolvedCandidate] = await Promise.all([
    realpath(root),
    realpath(candidate),
  ]);
  if (path.dirname(resolvedCandidate) !== resolvedRoot) return;

  const expected = new Set([
    BACKUP_DATABASE_FILE,
    BACKUP_METADATA_FILE,
    BACKUP_MANIFEST_FILE,
  ]);
  for (const entry of await readdir(candidate, { withFileTypes: true })) {
    if (!expected.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      return;
    }
  }
  for (const file of expected) {
    await rm(path.join(candidate, file), { force: true });
  }
  await rmdir(candidate);
}
