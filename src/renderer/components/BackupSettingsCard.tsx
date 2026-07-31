import type { BackupStatus } from '../../shared/backups';

interface BackupSettingsCardProps {
  readonly actionPending: boolean;
  readonly status: BackupStatus;
  readonly onAutomaticChange: (enabled: boolean) => void;
  readonly onRetentionChange: (
    retentionCount: 3 | 7 | 14 | 30,
  ) => void;
}

export function BackupSettingsCard({
  actionPending,
  status,
  onAutomaticChange,
  onRetentionChange,
}: BackupSettingsCardProps) {
  return (
    <article className="panel backup-settings-card">
      <p className="label">自動備份</p>
      <label className="checkbox-label backup-toggle">
        <input
          checked={status.automaticEnabled}
          disabled={actionPending}
          type="checkbox"
          onChange={(event) => onAutomaticChange(event.target.checked)}
        />
        啟用自動備份
      </label>
      <p className="backup-explanation">
        成功解鎖後會檢查一次；距離上次成功備份滿 24 小時才會建立
        新備份。達到保留份數後，會先確認新備份完整可用，再移除
        最舊的一份。關閉後仍可使用「立即備份」。
      </p>
      <label className="backup-retention">
        保留最近幾份成功備份
        <select
          disabled={actionPending}
          value={status.retentionCount}
          onChange={(event) =>
            onRetentionChange(
              Number(event.target.value) as 3 | 7 | 14 | 30,
            )
          }
        >
          {[3, 7, 14, 30].map((count) => (
            <option key={count} value={count}>{count} 份</option>
          ))}
        </select>
      </label>
      <div className="backup-location">
        <span>資料位置</span>
        <code>{status.dataDirectory}</code>
      </div>
      <div className="backup-location">
        <span>備份位置</span>
        <code>{status.backupDirectory}</code>
      </div>
    </article>
  );
}
