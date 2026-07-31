import { describe, expect, it } from 'vitest';

import { BackupService } from '../../src/application/backup-service';
import type {
  BackupExecutor,
  BackupInventory,
  BackupSettings,
  BackupSettingsRepository,
  StoredBackupIssue,
} from '../../src/application/ports/backup-port';
import { ERROR_CODES, FinanceHubError } from '../../src/shared/errors';

describe('BackupService', () => {
  it('delegates latest backup export to the backup executor', async () => {
    const executor = new FakeExecutor();
    const service = new BackupService(
      executor,
      new MemorySettings(),
      fixedClock(),
      immediateWrites(),
    );

    await service.exportLatest('D:\\FinanceHub exports');

    expect(executor.exportedTo).toBe('D:\\FinanceHub exports');
  });

  it('requires explicit confirmation before lowering retention deletes backups', async () => {
    const executor = new FakeExecutor();
    executor.inventory = {
      validBackupCount: 4,
      oldestSuccessfulAt: '2026-07-01T00:00:00.000Z',
      lastSuccessfulAt: '2026-07-04T00:00:00.000Z',
    };
    const settings = new MemorySettings();
    settings.value = { ...settings.value, retentionCount: 30 };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.setRetentionCount(3)).rejects.toMatchObject({
      code: ERROR_CODES.invalidInput,
    });
    expect(executor.lastRetentionCount).toBeUndefined();
    expect(settings.value.retentionCount).toBe(30);

    await service.setRetentionCount(3, true);
    expect(executor.lastRetentionCount).toBe(3);
    expect(settings.value.retentionCount).toBe(3);
  });

  it('keeps the new retention setting and records a warning when cleanup fails', async () => {
    const executor = new FakeExecutor();
    executor.inventory = { validBackupCount: 4 };
    executor.pruneFailure = new Error('simulated cleanup failure');
    const settings = new MemorySettings();
    settings.value = { ...settings.value, retentionCount: 30 };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.setRetentionCount(3, true)).resolves.toMatchObject({
      retentionCount: 3,
      validBackupCount: 4,
      cleanupWarning: {
        code: ERROR_CODES.backupCleanupFailure,
      },
    });
    expect(settings.value.retentionCount).toBe(3);
    expect(settings.value.cleanupWarning?.code).toBe(
      ERROR_CODES.backupCleanupFailure,
    );
  });

  it('does not prune any backup when persisting lower retention fails', async () => {
    const executor = new FakeExecutor();
    executor.inventory = { validBackupCount: 4 };
    const settings = new MemorySettings();
    settings.value = { ...settings.value, retentionCount: 30 };
    settings.failSetRetentionCount = true;
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.setRetentionCount(3, true)).rejects.toThrow(
      'simulated retention settings failure',
    );
    expect(executor.lastRetentionCount).toBeUndefined();
    expect(settings.value.retentionCount).toBe(30);
  });


  it('rebuilds successful time and count from inventory, not settings', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    executor.inventory = {
      validBackupCount: 2,
      lastSuccessfulAt: '2026-07-30T01:00:00.000Z',
    };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );
    await expect(service.getStatus()).resolves.toMatchObject({
      validBackupCount: 2,
      lastSuccessfulAt: '2026-07-30T01:00:00.000Z',
    });
  });

  it('prevents duplicate manual backups and exposes running state', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    let release!: () => void;
    executor.execution = new Promise((resolve) => {
      release = () => resolve({ completedAt: '2026-07-30T02:00:00.000Z' });
    });
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );
    const first = service.createNow();
    await expect(service.getStatus()).resolves.toMatchObject({ isRunning: true });
    const completion = service.waitForCurrentBackup();
    await expect(service.createNow()).rejects.toMatchObject({
      code: ERROR_CODES.backupInProgress,
    });
    release();
    await first;
    await expect(completion).resolves.toMatchObject({ isRunning: false });
  });

  it('resets the 24-hour interval only after success', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );
    await service.createNow();
    expect(settings.value.nextAutomaticBackupAt)
      .toBe('2026-07-31T02:00:00.000Z');
    expect(settings.value.lastError).toBeUndefined();

    executor.failure = new FinanceHubError(
      ERROR_CODES.backupIoFailure,
      'unsafe C:\\private\\path',
    );
    await expect(service.createNow()).rejects.toBe(executor.failure);
    expect(settings.value.nextAutomaticBackupAt)
      .toBe('2026-07-31T02:00:00.000Z');
    expect(settings.value.lastError).toEqual({
      code: ERROR_CODES.backupIoFailure,
      message: '備份未完成，請稍後再試。',
      occurredAt: '2026-07-30T03:00:00.000Z',
    });
    expect(JSON.stringify(settings.value)).not.toContain('private');
    await expect(service.getStatus()).resolves.toMatchObject({
      isRunning: false,
      lastError: {
        code: ERROR_CODES.backupIoFailure,
        message: '備份未完成，請稍後再試。',
      },
    });
  });

  it('keeps a published backup successful when status recording fails', async () => {
    const settings = new MemorySettings();
    settings.failRecordSuccess = true;
    settings.value = {
      ...settings.value,
      lastError: {
        code: ERROR_CODES.backupIoFailure,
        message: '先前的備份失敗。',
        occurredAt: '2026-07-30T01:00:00.000Z',
      },
    };
    const executor = new FakeExecutor();
    executor.inventory = {
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-30T02:00:00.000Z',
    };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.createNow()).resolves.toMatchObject({
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-30T02:00:00.000Z',
      nextAutomaticBackupAt: '2026-07-31T02:00:00.000Z',
      statusWarning: {
        code: ERROR_CODES.backupStatusUpdateFailure,
        message: '備份檔已建立，但無法更新備份狀態紀錄。',
      },
      lastError: undefined,
    });
    expect(executor.createCount).toBe(1);
    expect(settings.value.lastError).toBeDefined();

    await expect(service.getStatus()).resolves.toMatchObject({
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-30T02:00:00.000Z',
      nextAutomaticBackupAt: '2026-07-31T02:00:00.000Z',
    });
    expect(executor.createCount).toBe(1);
  });

  it('attempts an automatic backup once after unlock when no backup exists', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await service.attemptAutomaticAfterUnlock();
    await service.attemptAutomaticAfterUnlock();

    expect(executor.createCount).toBe(1);
  });

  it('does not attempt automatic backup before 24 hours', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    executor.inventory = {
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-29T04:00:00.000Z',
    };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await service.attemptAutomaticAfterUnlock();

    expect(executor.createCount).toBe(0);
  });

  it('attempts automatic backup at the exact 24-hour boundary', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    executor.inventory = {
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-29T03:00:00.000Z',
    };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await service.attemptAutomaticAfterUnlock();

    expect(executor.createCount).toBe(1);
  });

  it('does not reject unlock flow when the automatic attempt fails', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    executor.failure = new FinanceHubError(
      ERROR_CODES.backupIoFailure,
      'unsafe C:\\private\\path',
    );
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.attemptAutomaticAfterUnlock()).resolves.toBeUndefined();
    expect(executor.createCount).toBe(1);
    expect(settings.value.lastError?.code).toBe(ERROR_CODES.backupIoFailure);
  });

  it('checks immediately when automatic backup is re-enabled', async () => {
    const settings = new MemorySettings();
    settings.value = { ...settings.value, automaticEnabled: false };
    const executor = new FakeExecutor();
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await service.attemptAutomaticAfterUnlock();
    expect(executor.createCount).toBe(0);
    await service.setAutomaticEnabled(true);
    expect(executor.createCount).toBe(1);
  });

  it('checks again when automatic backup is disabled and re-enabled after an attempt', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await service.attemptAutomaticAfterUnlock();
    expect(executor.createCount).toBe(1);
    await service.setAutomaticEnabled(false);
    executor.inventory = { validBackupCount: 0 };
    await service.setAutomaticEnabled(true);

    expect(executor.createCount).toBe(2);
  });

  it('preserves the original backup error when recording failure also fails', async () => {
    const settings = new MemorySettings();
    settings.failRecordFailure = true;
    const executor = new FakeExecutor();
    const original = new FinanceHubError(
      ERROR_CODES.backupIoFailure,
      'original safe failure',
    );
    executor.failure = original;
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.createNow()).rejects.toBe(original);
    await expect(service.getStatus()).resolves.toMatchObject({
      isRunning: false,
      statusWarning: {
        code: ERROR_CODES.backupStatusUpdateFailure,
      },
    });
  });

  it('keeps a published backup successful when retention cleanup fails', async () => {
    const settings = new MemorySettings();
    const executor = new FakeExecutor();
    executor.pruneFailure = new Error('unsafe C:\\private\\cleanup');
    executor.inventory = {
      validBackupCount: 8,
      lastSuccessfulAt: '2026-07-30T02:00:00.000Z',
    };
    const service = new BackupService(
      executor, settings, fixedClock(), immediateWrites(),
    );

    await expect(service.createNow()).resolves.toMatchObject({
      validBackupCount: 8,
      cleanupWarning: {
        code: ERROR_CODES.backupCleanupFailure,
        message: '新備份已建立，但無法清理部分舊備份。',
      },
    });
    expect(executor.createCount).toBe(1);
    expect(executor.lastRetentionCount).toBe(7);
    expect(JSON.stringify(settings.value)).not.toContain('private');
  });
});

class FakeExecutor implements BackupExecutor {
  readonly dataDirectory = 'C:\\safe';
  readonly backupDirectory = 'C:\\safe\\backups';
  inventory: BackupInventory = { validBackupCount: 0 };
  execution: Promise<{ completedAt: string }> | undefined;
  failure: unknown;
  createCount = 0;
  lastRetentionCount: number | undefined;
  pruneFailure: unknown;
  exportedTo: string | undefined;

  async createBackup() {
    this.createCount += 1;
    if (this.failure) throw this.failure;
    return this.execution ??
      { completedAt: '2026-07-30T02:00:00.000Z' };
  }

  async inspectInventory() {
    return this.inventory;
  }

  async pruneBackups(retentionCount: 3 | 7 | 14 | 30) {
    this.lastRetentionCount = retentionCount;
    if (this.pruneFailure) throw this.pruneFailure;
  }

  async exportLatest(destinationRoot: string) {
    this.exportedTo = destinationRoot;
  }
}

class MemorySettings implements BackupSettingsRepository {
  value: BackupSettings = {
    automaticEnabled: true,
    retentionCount: 7,
  };
  failRecordSuccess = false;
  failRecordFailure = false;
  failSetRetentionCount = false;

  get() {
    return this.value;
  }

  recordSuccess(nextAutomaticBackupAt: string) {
    if (this.failRecordSuccess) throw new Error('simulated settings failure');
    this.value = {
      ...this.value,
      nextAutomaticBackupAt,
      lastError: undefined,
    };
  }

  recordFailure(issue: StoredBackupIssue) {
    if (this.failRecordFailure) {
      throw new Error('simulated failure recording failure');
    }
    this.value = { ...this.value, lastError: issue };
  }

  setAutomaticEnabled(enabled: boolean) {
    this.value = { ...this.value, automaticEnabled: enabled };
  }

  setRetentionCount(retentionCount: 3 | 7 | 14 | 30) {
    if (this.failSetRetentionCount) {
      throw new Error('simulated retention settings failure');
    }
    this.value = { ...this.value, retentionCount };
  }

  recordCleanupWarning(issue: StoredBackupIssue) {
    this.value = { ...this.value, cleanupWarning: issue };
  }

  clearCleanupWarning() {
    this.value = { ...this.value, cleanupWarning: undefined };
  }
}

function fixedClock() {
  return { now: () => '2026-07-30T03:00:00.000Z' };
}

function immediateWrites() {
  return {
    runWrite: async <T>(operation: () => T | Promise<T>) => operation(),
  };
}
