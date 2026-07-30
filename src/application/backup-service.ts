import type { Clock } from './ports/clock';
import {
  type BackupExecutor,
  type BackupSettingsRepository,
  type BackupWriteScheduler,
} from './ports/backup-port';
import type { BackupStatus } from '../shared/backups';
import {
  ERROR_CODES,
  FinanceHubError,
  errorCodeOf,
  type ErrorCode,
} from '../shared/errors';

const DAY_MS = 24 * 60 * 60 * 1000;

export class BackupService {
  private running = false;

  constructor(
    private readonly executor: BackupExecutor,
    private readonly settings: BackupSettingsRepository,
    private readonly clock: Clock,
    private readonly writes: BackupWriteScheduler,
  ) {}

  async getStatus(): Promise<BackupStatus> {
    const [settings, inventory] = await Promise.all([
      Promise.resolve(this.settings.get()),
      this.executor.inspectInventory(),
    ]);
    return {
      automaticEnabled: settings.automaticEnabled,
      backupDirectory: this.executor.backupDirectory,
      retentionCount: settings.retentionCount,
      isRunning: this.running,
      validBackupCount: inventory.validBackupCount,
      lastSuccessfulAt: inventory.lastSuccessfulAt,
      nextAutomaticBackupAt: settings.nextAutomaticBackupAt,
      lastError: settings.lastError,
      cleanupWarning: settings.cleanupWarning,
    };
  }

  async createNow(): Promise<BackupStatus> {
    if (this.running) {
      throw new FinanceHubError(
        ERROR_CODES.backupInProgress,
        '已有備份正在進行。',
      );
    }
    this.running = true;
    try {
      const result = await this.executor.createBackup();
      await this.writes.runWrite(() =>
        this.settings.recordSuccess(
          new Date(Date.parse(result.completedAt) + DAY_MS).toISOString(),
        ),
      );
    } catch (error) {
      const code = errorCodeOf(error);
      await this.writes.runWrite(() =>
        this.settings.recordFailure({
          code,
          message: safeBackupMessage(code),
          occurredAt: this.clock.now(),
        }),
      );
      throw error;
    } finally {
      this.running = false;
    }
    return this.getStatus();
  }
}

function safeBackupMessage(code: ErrorCode): string {
  switch (code) {
    case ERROR_CODES.backupCheckpointBusy:
      return '資料庫目前忙碌，請稍後再試。';
    case ERROR_CODES.backupSourceInvalid:
      return '備份來源檔案不完整。';
    case ERROR_CODES.backupFormatInvalid:
      return '備份格式或完整性驗證失敗。';
    case ERROR_CODES.backupWriteQueueFull:
      return '等待中的資料寫入過多，請稍後再試。';
    case ERROR_CODES.backupInProgress:
      return '已有備份正在進行。';
    default:
      return '備份未完成，請稍後再試。';
  }
}
