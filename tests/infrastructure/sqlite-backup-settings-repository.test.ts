import { afterEach, describe, expect, it } from 'vitest';

import { openBootstrapDatabase } from '../../src/infrastructure/database/bootstrap-database';
import { SqliteBackupSettingsRepository } from '../../src/infrastructure/database/sqlite-backup-settings-repository';
import { ERROR_CODES } from '../../src/shared/errors';

describe('SqliteBackupSettingsRepository', () => {
  let connection: ReturnType<typeof openBootstrapDatabase> | undefined;

  afterEach(() => connection?.close());

  it('stores safe failure state and does not reset next due time on failure', () => {
    connection = openBootstrapDatabase(':memory:');
    const repository = new SqliteBackupSettingsRepository(connection.database);
    repository.recordSuccess('2026-07-31T00:00:00.000Z');
    repository.recordFailure({
      code: ERROR_CODES.backupIoFailure,
      message: '備份未完成，請稍後再試。',
      occurredAt: '2026-07-30T01:00:00.000Z',
    });
    expect(repository.get()).toMatchObject({
      nextAutomaticBackupAt: '2026-07-31T00:00:00.000Z',
      lastError: {
        code: ERROR_CODES.backupIoFailure,
        message: '備份未完成，請稍後再試。',
      },
    });
  });

  it('loads a persisted cleanup warning for status reporting', () => {
    connection = openBootstrapDatabase(':memory:');
    connection.database.prepare(`
      UPDATE backup_settings
      SET cleanup_warning_code = ?,
          cleanup_warning_message = ?,
          cleanup_warning_at = ?
      WHERE id = 1
    `).run(
      ERROR_CODES.backupIoFailure,
      '部分舊備份尚未清理。',
      '2026-07-30T02:00:00.000Z',
    );
    const repository = new SqliteBackupSettingsRepository(connection.database);
    expect(repository.get().cleanupWarning).toEqual({
      code: ERROR_CODES.backupIoFailure,
      message: '部分舊備份尚未清理。',
      occurredAt: '2026-07-30T02:00:00.000Z',
    });
    repository.clearCleanupWarning();
    expect(repository.get().cleanupWarning).toBeUndefined();
  });

  it('updates automatic and retention settings through validated values', () => {
    connection = openBootstrapDatabase(':memory:');
    const repository = new SqliteBackupSettingsRepository(connection.database);

    repository.setAutomaticEnabled(false);
    repository.setRetentionCount(14);

    expect(repository.get()).toMatchObject({
      automaticEnabled: false,
      retentionCount: 14,
    });
  });

  it('stores a safe cleanup warning', () => {
    connection = openBootstrapDatabase(':memory:');
    const repository = new SqliteBackupSettingsRepository(connection.database);
    repository.recordCleanupWarning({
      code: ERROR_CODES.backupCleanupFailure,
      message: '新備份已建立，但無法清理部分舊備份。',
      occurredAt: '2026-07-30T02:00:00.000Z',
    });

    expect(repository.get().cleanupWarning).toEqual({
      code: ERROR_CODES.backupCleanupFailure,
      message: '新備份已建立，但無法清理部分舊備份。',
      occurredAt: '2026-07-30T02:00:00.000Z',
    });
  });
});
