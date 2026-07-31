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
  private automaticAttempted = false;
  private statusWarning: BackupStatus['statusWarning'];
  private readonly completionWaiters = new Set<() => void>();

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
      dataDirectory: this.executor.dataDirectory,
      backupDirectory: this.executor.backupDirectory,
      retentionCount: settings.retentionCount,
      isRunning: this.running,
      validBackupCount: inventory.validBackupCount,
      oldestSuccessfulAt: inventory.oldestSuccessfulAt,
      lastSuccessfulAt: inventory.lastSuccessfulAt,
      nextAutomaticBackupAt: nextBackupAt(
        inventory.lastSuccessfulAt,
        settings.nextAutomaticBackupAt,
      ),
      lastError: currentFailure(
        settings.lastError,
        inventory.lastSuccessfulAt,
      ),
      statusWarning: this.statusWarning,
      cleanupWarning: settings.cleanupWarning,
    };
  }

  async createNow(): Promise<BackupStatus> {
    await this.createBackup();
    return this.getStatus();
  }

  async waitForCurrentBackup(): Promise<BackupStatus> {
    if (this.running) {
      await new Promise<void>((resolve) => {
        this.completionWaiters.add(resolve);
      });
    }
    return this.getStatus();
  }

  async attemptAutomaticAfterUnlock(): Promise<void> {
    if (this.automaticAttempted || this.running) return;
    const status = await this.getStatus();
    if (
      this.automaticAttempted ||
      this.running ||
      !status.automaticEnabled ||
      !automaticBackupDue(status, this.clock.now())
    ) {
      return;
    }
    this.automaticAttempted = true;
    try {
      await this.createBackup();
    } catch {
      // Automatic backup failures are visible in status and do not block unlock.
    }
  }

  async setAutomaticEnabled(enabled: unknown): Promise<BackupStatus> {
    if (typeof enabled !== 'boolean') throw invalidBackupSetting();
    await this.writes.runWrite(() =>
      this.settings.setAutomaticEnabled(enabled),
    );
    if (enabled) await this.attemptAutomaticAfterUnlock();
    return this.getStatus();
  }

  async setRetentionCount(
    value: unknown,
    confirmRemoval: unknown = false,
  ): Promise<BackupStatus> {
    if (value !== 3 && value !== 7 && value !== 14 && value !== 30) {
      throw invalidBackupSetting();
    }
    const inventory = await this.executor.inspectInventory();
    if (inventory.validBackupCount > value) {
      if (confirmRemoval !== true) throw invalidBackupSetting();
      await this.executor.pruneBackups(value);
    }
    await this.writes.runWrite(() => this.settings.setRetentionCount(value));
    return this.getStatus();
  }

  async exportLatest(destinationRoot: unknown): Promise<void> {
    if (this.running) {
      throw new FinanceHubError(
        ERROR_CODES.backupInProgress,
        '已有備份正在進行。',
      );
    }
    if (typeof destinationRoot !== 'string' || !destinationRoot) {
      throw invalidBackupSetting();
    }
    await this.executor.exportLatest(destinationRoot);
  }

  private async createBackup(): Promise<void> {
    if (this.running) {
      throw new FinanceHubError(
        ERROR_CODES.backupInProgress,
        '已有備份正在進行。',
      );
    }
    const retentionCount = this.settings.get().retentionCount;
    this.running = true;
    let completedAt: string;
    try {
      const result = await this.executor.createBackup();
      completedAt = result.completedAt;
    } catch (error) {
      const code = errorCodeOf(error);
      try {
        await this.writes.runWrite(() =>
          this.settings.recordFailure({
            code,
            message: safeBackupMessage(code),
            occurredAt: this.clock.now(),
          }),
        );
      } finally {
        this.finishRunningBackup();
      }
      throw error;
    }

    let cleanupWarning: BackupStatus['cleanupWarning'];
    let statusUpdateFailed = false;
    try {
      await this.executor.pruneBackups(retentionCount);
    } catch {
      cleanupWarning = {
        code: ERROR_CODES.backupCleanupFailure,
        message: '新備份已建立，但無法清理部分舊備份。',
        occurredAt: this.clock.now(),
      } as const;
    }
    try {
      if (cleanupWarning) {
        await this.writes.runWrite(() =>
          this.settings.recordCleanupWarning(cleanupWarning),
        );
      } else {
        await this.writes.runWrite(() =>
          this.settings.clearCleanupWarning(),
        );
      }
    } catch {
      statusUpdateFailed = true;
      this.statusWarning = statusUpdateWarning(this.clock.now());
    }

    try {
      await this.writes.runWrite(() =>
        this.settings.recordSuccess(
          addDay(completedAt),
        ),
      );
      if (!statusUpdateFailed) this.statusWarning = undefined;
    } catch {
      this.statusWarning = statusUpdateWarning(this.clock.now());
    } finally {
      this.finishRunningBackup();
    }
  }

  private finishRunningBackup(): void {
    this.running = false;
    for (const resolve of this.completionWaiters) resolve();
    this.completionWaiters.clear();
  }
}

function nextBackupAt(
  lastSuccessfulAt: string | undefined,
  storedNextAt: string | undefined,
): string | undefined {
  return lastSuccessfulAt ? addDay(lastSuccessfulAt) : storedNextAt;
}

function addDay(value: string): string {
  return new Date(Date.parse(value) + DAY_MS).toISOString();
}

function automaticBackupDue(
  status: BackupStatus,
  now: string,
): boolean {
  if (!status.lastSuccessfulAt) return true;
  return Date.parse(now) >= Date.parse(addDay(status.lastSuccessfulAt));
}

function currentFailure(
  failure: BackupStatus['lastError'],
  lastSuccessfulAt: string | undefined,
): BackupStatus['lastError'] {
  if (
    failure &&
    lastSuccessfulAt &&
    Date.parse(failure.occurredAt) <= Date.parse(lastSuccessfulAt)
  ) {
    return undefined;
  }
  return failure;
}

function invalidBackupSetting(): FinanceHubError {
  return new FinanceHubError(
    ERROR_CODES.invalidInput,
    '備份設定不正確。',
  );
}

function statusUpdateWarning(
  occurredAt: string,
): NonNullable<BackupStatus['statusWarning']> {
  return {
    code: ERROR_CODES.backupStatusUpdateFailure,
    message: '備份檔已建立，但無法更新備份狀態紀錄。',
    occurredAt,
  };
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
