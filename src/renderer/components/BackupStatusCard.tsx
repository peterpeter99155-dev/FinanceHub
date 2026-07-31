import type { BackupStatus } from '../../shared/backups';
import {
  backupHeadline,
  formatBackupTime,
} from '../backupViewModel';

interface BackupStatusCardProps {
  readonly actionPending: boolean;
  readonly backingUp: boolean;
  readonly status: BackupStatus;
  readonly onBackup: () => void;
  readonly onRefresh: () => void;
}

export function BackupStatusCard({
  actionPending,
  backingUp,
  status,
  onBackup,
  onRefresh,
}: BackupStatusCardProps) {
  return (
    <article className="panel backup-status-card">
      <p className="label">備份狀態</p>
      <strong>{backingUp ? '備份進行中…' : backupHeadline(status)}</strong>
      <dl className="backup-facts">
        <div>
          <dt>最後成功備份</dt>
          <dd>{formatBackupTime(status.lastSuccessfulAt)}</dd>
        </div>
        <div>
          <dt>現存有效備份</dt>
          <dd>
            {status.validBackupCount} / {status.retentionCount} 份
          </dd>
        </div>
        <div>
          <dt>下次可自動備份</dt>
          <dd>{formatBackupTime(status.nextAutomaticBackupAt)}</dd>
        </div>
      </dl>
      <div className="backup-actions">
        <button
          className="primary-button"
          data-testid="backup-now"
          disabled={actionPending || backingUp}
          type="button"
          onClick={onBackup}
        >
          {backingUp ? '正在備份…' : '立即備份'}
        </button>
        <button
          className="secondary-button"
          disabled={actionPending}
          type="button"
          onClick={onRefresh}
        >
          重新整理狀態
        </button>
      </div>
    </article>
  );
}
