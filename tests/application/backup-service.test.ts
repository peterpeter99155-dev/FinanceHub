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
    await expect(service.createNow()).rejects.toMatchObject({
      code: ERROR_CODES.backupInProgress,
    });
    release();
    await first;
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
});

class FakeExecutor implements BackupExecutor {
  readonly backupDirectory = 'C:\\safe\\backups';
  inventory: BackupInventory = { validBackupCount: 0 };
  execution: Promise<{ completedAt: string }> | undefined;
  failure: unknown;

  async createBackup() {
    if (this.failure) throw this.failure;
    return this.execution ??
      { completedAt: '2026-07-30T02:00:00.000Z' };
  }

  async inspectInventory() {
    return this.inventory;
  }
}

class MemorySettings implements BackupSettingsRepository {
  value: BackupSettings = {
    automaticEnabled: true,
    retentionCount: 7,
  };

  get() {
    return this.value;
  }

  recordSuccess(nextAutomaticBackupAt: string) {
    this.value = {
      ...this.value,
      nextAutomaticBackupAt,
      lastError: undefined,
    };
  }

  recordFailure(issue: StoredBackupIssue) {
    this.value = { ...this.value, lastError: issue };
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
