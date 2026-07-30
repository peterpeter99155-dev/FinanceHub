import type { ErrorCode } from '../../shared/errors';

export interface BackupExecution {
  readonly completedAt: string;
}

export interface BackupInventory {
  readonly validBackupCount: number;
  readonly lastSuccessfulAt?: string;
}

export interface BackupExecutor {
  readonly dataDirectory: string;
  readonly backupDirectory: string;
  createBackup(): Promise<BackupExecution>;
  inspectInventory(): Promise<BackupInventory>;
  pruneBackups(retentionCount: 3 | 7 | 14 | 30): Promise<void>;
}

export interface BackupSettings {
  readonly automaticEnabled: boolean;
  readonly retentionCount: 3 | 7 | 14 | 30;
  readonly nextAutomaticBackupAt?: string;
  readonly lastError?: StoredBackupIssue;
  readonly cleanupWarning?: StoredBackupIssue;
}

export interface StoredBackupIssue {
  readonly code: ErrorCode;
  readonly message: string;
  readonly occurredAt: string;
}

export interface BackupSettingsRepository {
  get(): BackupSettings;
  recordSuccess(nextAutomaticBackupAt: string): void;
  recordFailure(issue: StoredBackupIssue): void;
  setAutomaticEnabled(enabled: boolean): void;
  setRetentionCount(retentionCount: 3 | 7 | 14 | 30): void;
  recordCleanupWarning(issue: StoredBackupIssue): void;
  clearCleanupWarning(): void;
}

export interface BackupWriteScheduler {
  runWrite<T>(operation: () => T | Promise<T>): Promise<T>;
}
