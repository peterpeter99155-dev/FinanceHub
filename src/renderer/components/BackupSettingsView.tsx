import { useEffect, useState } from 'react';

import type { BackupStatus } from '../../shared/backups';
import { backupErrorMessage } from '../messages';

type BackupAction =
  | 'backup'
  | 'refresh'
  | 'automatic'
  | 'retention'
  | 'folder';

export function BackupSettingsView() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<BackupAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.financeHub.backups
      .getStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(backupErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!status?.isRunning) return;
    let active = true;
    void window.financeHub.backups
      .waitForCurrentBackup()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(backupErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [status?.isRunning]);

  async function run(
    kind: BackupAction,
    operation: () => Promise<BackupStatus | void>,
  ) {
    if (action) return;
    setAction(kind);
    setError(null);
    try {
      const result = await operation();
      setStatus(
        result ?? await window.financeHub.backups.getStatus(),
      );
    } catch (caught) {
      setError(backupErrorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <section className="panel backup-panel state-panel" aria-live="polite">
        正在讀取備份狀態…
      </section>
    );
  }

  if (!status) {
    return (
      <section className="panel backup-panel state-panel error-state">
        <h2>無法讀取備份狀態</h2>
        <p>{error}</p>
      </section>
    );
  }

  const backingUp = status.isRunning || action === 'backup';
  return (
    <section className="backup-workspace" aria-labelledby="backup-title">
      <div className="section-heading backup-heading">
        <div>
          <p className="label">本機資料保護</p>
          <h2 id="backup-title">資料與備份</h2>
        </div>
        <button
          className="secondary-button"
          disabled={Boolean(action)}
          type="button"
          onClick={() =>
            void run('folder', () =>
              window.financeHub.backups.openDirectory(),
            )
          }
        >
          開啟備份資料夾
        </button>
      </div>

      <div className="backup-grid">
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
              <dd>{status.validBackupCount} 份</dd>
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
              disabled={Boolean(action) || backingUp}
              type="button"
              onClick={() =>
                void run('backup', () =>
                  window.financeHub.backups.createNow(),
                )
              }
            >
              {backingUp ? '正在備份…' : '立即備份'}
            </button>
            <button
              className="secondary-button"
              disabled={Boolean(action)}
              type="button"
              onClick={() =>
                void run('refresh', () =>
                  window.financeHub.backups.getStatus(),
                )
              }
            >
              重新整理狀態
            </button>
          </div>
        </article>

        <article className="panel backup-settings-card">
          <p className="label">自動備份</p>
          <label className="checkbox-label backup-toggle">
            <input
              checked={status.automaticEnabled}
              disabled={Boolean(action)}
              type="checkbox"
              onChange={(event) =>
                void run('automatic', () =>
                  window.financeHub.backups.setAutomaticEnabled(
                    event.target.checked,
                  ),
                )
              }
            />
            啟用自動備份
          </label>
          <p className="backup-explanation">
            成功解鎖後會檢查一次；距離上次成功備份滿 24 小時才會建立
            新備份。關閉後仍可使用「立即備份」。
          </p>
          <label className="backup-retention">
            保留最近幾份成功備份
            <select
              disabled={Boolean(action)}
              value={status.retentionCount}
              onChange={(event) =>
                void run('retention', () =>
                  window.financeHub.backups.setRetentionCount(
                    Number(event.target.value) as 3 | 7 | 14 | 30,
                  ),
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
      </div>

      {status.lastError && (
        <p className="backup-message error-state" role="alert">
          最近一次備份未完成：{status.lastError.message}
        </p>
      )}
      {status.cleanupWarning && (
        <p className="backup-message warning-state" role="status">
          {status.cleanupWarning.message}
        </p>
      )}
      {status.statusWarning && (
        <p className="backup-message warning-state" role="status">
          {status.statusWarning.message}
        </p>
      )}
      {error && (
        <p className="backup-message error-state" role="alert">{error}</p>
      )}
    </section>
  );
}

function backupHeadline(status: BackupStatus): string {
  if (status.lastError) return '最近一次備份未完成';
  if (status.lastSuccessfulAt) return '備份狀態正常';
  return '尚未建立備份';
}

function formatBackupTime(value: string | undefined): string {
  if (!value) return '尚無紀錄';
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}
