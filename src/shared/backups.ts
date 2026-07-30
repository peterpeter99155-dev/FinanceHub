import type { ErrorCode } from './errors';

export interface BackupIssue {
  readonly code: ErrorCode;
  readonly message: string;
  readonly occurredAt: string;
}

export interface BackupStatus {
  readonly automaticEnabled: boolean;
  readonly backupDirectory: string;
  readonly retentionCount: 3 | 7 | 14 | 30;
  readonly isRunning: boolean;
  readonly validBackupCount: number;
  readonly lastSuccessfulAt?: string;
  readonly nextAutomaticBackupAt?: string;
  readonly lastError?: BackupIssue;
  readonly statusWarning?: BackupIssue;
  readonly cleanupWarning?: BackupIssue;
}

export interface BackupsApi {
  getStatus(): Promise<BackupStatus>;
  createNow(): Promise<BackupStatus>;
  setAutomaticEnabled(enabled: boolean): Promise<BackupStatus>;
  setRetentionCount(
    retentionCount: 3 | 7 | 14 | 30,
  ): Promise<BackupStatus>;
  openDirectory(): Promise<void>;
}
