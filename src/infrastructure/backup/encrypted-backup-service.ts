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

import type {
  BackupExecutor,
  BackupInventory,
} from '../../application/ports/backup-port';
import { ERROR_CODES, FinanceHubError } from '../../shared/errors';
import type { SqliteDatabase } from '../database/sqlite-database';
import type { DatabaseWriteGate } from '../main/database-write-gate';
import { readEncryptionMetadata } from '../security/database-metadata';
import {
  BACKUP_DATABASE_FILE,
  BACKUP_MANIFEST_FILE,
  BACKUP_METADATA_FILE,
  backupDirectoryMatches,
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

type MoveDirectory = (source: string, target: string) => Promise<void>;

export class EncryptedBackupService implements BackupExecutor {
  readonly dataDirectory: string;

  constructor(
    private readonly database: SqliteDatabase,
    private readonly databasePath: string,
    readonly backupDirectory: string,
    private readonly applicationVersion: string,
    private readonly gate: DatabaseWriteGate,
    private readonly now: () => Date = () => new Date(),
    private readonly makeBackupId: () => string = createBackupId,
    private readonly moveForCleanup: MoveDirectory = rename,
  ) {
    this.dataDirectory = path.dirname(databasePath);
  }

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
    await mkdir(this.backupDirectory, { recursive: true });
    for (const entry of await readdir(this.backupDirectory, { withFileTypes: true })) {
      if (!/^\.(creating|deleting)-[0-9a-f-]{36}$/i.test(entry.name)) {
        continue;
      }
      const candidate = path.join(this.backupDirectory, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      await removeOwnedTemporaryDirectory(this.backupDirectory, candidate);
    }
  }

  async inspectInventory(): Promise<BackupInventory> {
    const backups = await this.validBackups();
    return {
      validBackupCount: backups.length,
      lastSuccessfulAt: backups.at(-1)?.manifest.completedAt,
    };
  }

  async exportLatest(destinationRoot: string): Promise<void> {
    const backups = await this.validBackups();
    const latest = backups.at(-1);
    if (!latest) {
      throw new FinanceHubError(
        ERROR_CODES.backupExportUnavailable,
        '目前沒有可匯出的有效備份。',
      );
    }
    const rootInfo = await lstat(destinationRoot).catch(() => undefined);
    if (
      !rootInfo?.isDirectory() ||
      rootInfo.isSymbolicLink()
    ) {
      throw backupExportFailure();
    }

    const exportDirectory = path.join(
      destinationRoot,
      path.basename(latest.directory),
    );
    let exportDirectoryCreated = false;
    try {
      await mkdir(exportDirectory, { recursive: false });
      exportDirectoryCreated = true;
      for (const file of [
        BACKUP_DATABASE_FILE,
        BACKUP_METADATA_FILE,
        BACKUP_MANIFEST_FILE,
      ]) {
        await copyAndSync(
          path.join(latest.directory, file),
          path.join(exportDirectory, file),
        );
      }
      const exported = await validateBackupDirectory(exportDirectory);
      if (!sameManifest(exported, latest.manifest)) {
        throw new Error('exported backup identity mismatch');
      }
    } catch (error) {
      if (exportDirectoryCreated) {
        await removeOwnedTemporaryDirectory(
          destinationRoot,
          exportDirectory,
        ).catch(() => undefined);
      }
      if (error instanceof FinanceHubError) throw error;
      throw backupExportFailure();
    }
  }

  async pruneBackups(retentionCount: 3 | 7 | 14 | 30): Promise<void> {
    const backups = await this.validBackups();
    const expired = backups.slice(0, Math.max(0, backups.length - retentionCount));
    for (const backup of expired) {
      try {
        await quarantineAndDeleteBackup(
          this.backupDirectory,
          backup.directory,
          backup.manifest,
          this.moveForCleanup,
        );
      } catch {
        throw new FinanceHubError(
          ERROR_CODES.backupCleanupFailure,
          '新備份已建立，但無法安全清理舊備份。',
        );
      }
    }
  }

  private async validBackups(): Promise<readonly ValidBackup[]> {
    await mkdir(this.backupDirectory, { recursive: true });
    const backups: ValidBackup[] = [];
    for (const entry of await readdir(this.backupDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      try {
        const directory = path.join(this.backupDirectory, entry.name);
        const manifest = await validateBackupDirectory(directory);
        if (!backupDirectoryMatches(entry.name, manifest)) continue;
        backups.push({ directory, manifest });
      } catch {
        // Invalid or unknown directories are not counted and are never deleted.
      }
    }
    backups.sort((left, right) =>
      left.manifest.completedAt.localeCompare(right.manifest.completedAt) ||
      left.manifest.backupId.localeCompare(right.manifest.backupId),
    );
    return backups;
  }

  private async createConsistentBackup(): Promise<BackupManifestV1> {
    await assertRegularSourceFile(this.databasePath);
    await assertRegularSourceFile(`${this.databasePath}.metadata.json`);
    await mkdir(this.backupDirectory, { recursive: true });
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
      this.backupDirectory,
      creatingDirectoryName(backupId),
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
      const completedDirectory = path.join(
        this.backupDirectory,
        backupDirectoryName(backupId, manifest.completedAt),
      );
      await rename(temporaryDirectory, completedDirectory);
      return manifest;
    } catch (error) {
      await removeOwnedTemporaryDirectory(
        this.backupDirectory,
        temporaryDirectory,
      ).catch(() => undefined);
      if (error instanceof FinanceHubError) throw error;
      throw backupIoFailure();
    }
  }
}

interface ValidBackup {
  readonly directory: string;
  readonly manifest: BackupManifestV1;
}

function backupIoFailure(): FinanceHubError {
  return new FinanceHubError(
    ERROR_CODES.backupIoFailure,
    '建立備份時發生檔案系統錯誤。',
  );
}

function backupExportFailure(): FinanceHubError {
  return new FinanceHubError(
    ERROR_CODES.backupExportFailure,
    '匯出備份時發生檔案系統錯誤。',
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

async function quarantineAndDeleteBackup(
  root: string,
  candidate: string,
  expectedManifest: BackupManifestV1,
  moveDirectory: MoveDirectory,
): Promise<void> {
  const manifest = await validateBackupDirectory(candidate);
  if (
    manifest.backupId !== expectedManifest.backupId ||
    !backupDirectoryMatches(path.basename(candidate), manifest)
  ) {
    throw new Error('backup changed before cleanup');
  }
  const [rootInfo, candidateInfo, resolvedRoot, resolvedCandidate] =
    await Promise.all([
      lstat(root),
      lstat(candidate),
      realpath(root),
      realpath(candidate),
    ]);
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    !candidateInfo.isDirectory() ||
    candidateInfo.isSymbolicLink() ||
    path.dirname(resolvedCandidate) !== resolvedRoot
  ) {
    throw new Error('unsafe backup cleanup target');
  }

  const quarantine = path.join(
    root,
    `.deleting-${manifest.backupId}`,
  );
  await moveDirectory(candidate, quarantine);
  const quarantinedManifest = await validateBackupDirectory(quarantine);
  if (!sameManifest(quarantinedManifest, expectedManifest)) {
    throw new Error('backup identity changed during cleanup');
  }
  for (const file of [
    BACKUP_DATABASE_FILE,
    BACKUP_METADATA_FILE,
    BACKUP_MANIFEST_FILE,
  ]) {
    const target = path.join(quarantine, file);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error('unsafe backup file');
    }
    await rm(target);
  }
  await rmdir(quarantine);
}

function sameManifest(
  left: BackupManifestV1,
  right: BackupManifestV1,
): boolean {
  return (
    left.formatVersion === right.formatVersion &&
    left.backupId === right.backupId &&
    left.createdAt === right.createdAt &&
    left.completedAt === right.completedAt &&
    left.applicationVersion === right.applicationVersion &&
    left.databaseSchemaVersion === right.databaseSchemaVersion &&
    sameFile(left.database, right.database) &&
    sameFile(left.metadata, right.metadata) &&
    left.encryption.formatVersion === right.encryption.formatVersion &&
    left.encryption.kdfVersion === right.encryption.kdfVersion
  );
}

function sameFile(
  left: BackupManifestV1['database'],
  right: BackupManifestV1['database'],
): boolean {
  return (
    left.file === right.file &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}
