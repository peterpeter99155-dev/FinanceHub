import type {
  BackupSettings,
  BackupSettingsRepository,
  StoredBackupIssue,
} from '../../application/ports/backup-port';
import type { ErrorCode } from '../../shared/errors';
import type { SqliteDatabase } from './sqlite-database';

interface BackupSettingsRow {
  automatic_enabled: number;
  retention_count: 3 | 7 | 14 | 30;
  next_automatic_backup_at: string | null;
  last_error_code: ErrorCode | null;
  last_error_message: string | null;
  last_error_at: string | null;
  cleanup_warning_code: ErrorCode | null;
  cleanup_warning_message: string | null;
  cleanup_warning_at: string | null;
}

export class SqliteBackupSettingsRepository
implements BackupSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  get(): BackupSettings {
    const row = this.database.prepare(
      'SELECT * FROM backup_settings WHERE id = 1',
    ).get() as BackupSettingsRow;
    return {
      automaticEnabled: row.automatic_enabled === 1,
      retentionCount: row.retention_count,
      nextAutomaticBackupAt: row.next_automatic_backup_at ?? undefined,
      lastError: issue(
        row.last_error_code,
        row.last_error_message,
        row.last_error_at,
      ),
      cleanupWarning: issue(
        row.cleanup_warning_code,
        row.cleanup_warning_message,
        row.cleanup_warning_at,
      ),
    };
  }

  recordSuccess(nextAutomaticBackupAt: string): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET next_automatic_backup_at = ?,
          last_error_code = NULL,
          last_error_message = NULL,
          last_error_at = NULL
      WHERE id = 1
    `).run(nextAutomaticBackupAt);
  }

  recordFailure(value: StoredBackupIssue): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET last_error_code = ?,
          last_error_message = ?,
          last_error_at = ?
      WHERE id = 1
    `).run(value.code, value.message, value.occurredAt);
  }

  setAutomaticEnabled(enabled: boolean): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET automatic_enabled = ?
      WHERE id = 1
    `).run(enabled ? 1 : 0);
  }

  setRetentionCount(retentionCount: 3 | 7 | 14 | 30): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET retention_count = ?
      WHERE id = 1
    `).run(retentionCount);
  }

  recordCleanupWarning(value: StoredBackupIssue): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET cleanup_warning_code = ?,
          cleanup_warning_message = ?,
          cleanup_warning_at = ?
      WHERE id = 1
    `).run(value.code, value.message, value.occurredAt);
  }

  clearCleanupWarning(): void {
    this.database.prepare(`
      UPDATE backup_settings
      SET cleanup_warning_code = NULL,
          cleanup_warning_message = NULL,
          cleanup_warning_at = NULL
      WHERE id = 1
    `).run();
  }
}

function issue(
  code: ErrorCode | null,
  message: string | null,
  occurredAt: string | null,
): StoredBackupIssue | undefined {
  if (!code || !message || !occurredAt) return undefined;
  return { code, message, occurredAt };
}
