import { useEffect, useState } from 'react';
import type { BackupStatus } from '../../shared/backups';
import { backupErrorMessage } from '../messages';
import { BackupStatusFeedback, type BackupFeedback } from './BackupStatusFeedback';
import { BackupSettingsHeading } from './BackupSettingsHeading';
import { BackupSettingsCard } from './BackupSettingsCard';
import { BackupHelpDialog } from './BackupHelpDialog';
import { BackupReplacementDialog } from './BackupReplacementDialog';
import { BackupStatusCard } from './BackupStatusCard';
import { RetentionReductionDialog } from './RetentionReductionDialog';

type BackupAction = 'backup' | 'refresh' | 'automatic' | 'retention' |
  'folder' | 'export';

export function BackupSettingsView() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<BackupAction | null>(null);
  const [feedback, setFeedback] = useState<BackupFeedback | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [pendingRetention, setPendingRetention] =
    useState<3 | 7 | 14 | 30 | null>(null);

  useEffect(() => {
    if (feedback?.tone !== 'success') return;
    const timer = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    let active = true;
    void window.financeHub.backups
      .getStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((caught: unknown) => {
        if (active) {
          setFeedback({
            tone: 'error',
            message: backupErrorMessage(caught),
          });
        }
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
        if (active) {
          setFeedback({
            tone: 'error',
            message: backupErrorMessage(caught),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [status?.isRunning]);

  async function run(
    kind: BackupAction,
    operation: () => Promise<BackupStatus | void>,
    successMessage?: string,
  ) {
    if (action) return;
    setAction(kind);
    setFeedback(null);
    try {
      const result = await operation();
      setStatus(
        result ?? await window.financeHub.backups.getStatus(),
      );
      if (successMessage) {
        setFeedback({ tone: 'success', message: successMessage });
      }
    } catch (caught) {
      setFeedback({
        tone: 'error',
        message: backupErrorMessage(caught),
      });
    } finally {
      setAction(null);
    }
  }

  async function exportLatest() {
    if (action) return;
    setAction('export');
    setFeedback(null);
    try {
      const result = await window.financeHub.backups.exportLatest();
      if (result === 'exported') {
        setFeedback({ tone: 'success', message: '最新備份已匯出' });
      }
    } catch (caught) {
      setFeedback({
        tone: 'error',
        message: backupErrorMessage(caught),
      });
    } finally {
      setAction(null);
    }
  }

  async function createBackup(replacesOldest: boolean) {
    if (action) return;
    setAction('backup');
    setFeedback(null);
    try {
      const result = await window.financeHub.backups.createNow();
      setStatus(result);
      if (replacesOldest && result.cleanupWarning) {
        setFeedback({
          tone: 'warning',
          message: '新備份已完成，但無法移除最舊的備份',
        });
      } else {
        const removedCount = Math.max(
          1,
          (status?.validBackupCount ?? 0) + 1 - result.validBackupCount,
        );
        setFeedback({
          tone: 'success',
          message: replacesOldest
            ? `備份已完成，並已移除最舊的 ${removedCount} 份備份`
            : '備份已完成',
        });
      }
    } catch (caught) {
      setFeedback({
        tone: 'error',
        message: backupErrorMessage(caught),
      });
    } finally {
      setAction(null);
    }
  }

  function changeRetention(value: 3 | 7 | 14 | 30) {
    if (value < status!.validBackupCount) {
      setPendingRetention(value);
      return;
    }
    void run('retention', () =>
      window.financeHub.backups.setRetentionCount(value),
    );
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
        <p>{feedback?.message}</p>
      </section>
    );
  }

  const backingUp = status.isRunning || action === 'backup';
  return (
    <section className="backup-workspace" aria-labelledby="backup-title">
      <BackupSettingsHeading
        disabled={Boolean(action)}
        exporting={action === 'export'}
        onExport={() => void exportLatest()}
        onHelp={() => setHelpOpen(true)}
        onOpenDirectory={() =>
          void run('folder', () =>
            window.financeHub.backups.openDirectory(),
          )
        }
      />

      <div className="backup-feedback-slot">
        {feedback && <BackupStatusFeedback feedback={feedback} />}
      </div>

      <div className="backup-grid">
        <BackupStatusCard
          actionPending={Boolean(action)}
          backingUp={backingUp}
          status={status}
          onBackup={() => {
            if (status.validBackupCount >= status.retentionCount) {
              setReplacementOpen(true);
            } else {
              void createBackup(false);
            }
          }}
          onRefresh={() =>
            void run(
              'refresh',
              () => window.financeHub.backups.getStatus(),
              '備份狀態已更新',
            )
          }
        />

        <BackupSettingsCard
          actionPending={Boolean(action)}
          status={status}
          onAutomaticChange={(enabled) =>
            void run('automatic', () =>
              window.financeHub.backups.setAutomaticEnabled(enabled),
            )
          }
          onRetentionChange={changeRetention}
        />
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
      {helpOpen && (
        <BackupHelpDialog onClose={() => setHelpOpen(false)} />
      )}
      {replacementOpen && (
        <BackupReplacementDialog
          oldestSuccessfulAt={status.oldestSuccessfulAt}
          removalCount={Math.max(
            1,
            status.validBackupCount - status.retentionCount + 1,
          )}
          onCancel={() => setReplacementOpen(false)}
          onConfirm={() => {
            setReplacementOpen(false);
            void createBackup(true);
          }}
        />
      )}
      {pendingRetention !== null && (
        <RetentionReductionDialog
          oldestSuccessfulAt={status.oldestSuccessfulAt}
          removalCount={status.validBackupCount - pendingRetention}
          retentionCount={pendingRetention}
          onCancel={() => setPendingRetention(null)}
          onConfirm={() => {
            const value = pendingRetention;
            setPendingRetention(null);
            void run(
              'retention',
              () => window.financeHub.backups.setRetentionCount(value, true),
              `已保留最近 ${value} 份備份`,
            );
          }}
        />
      )}
    </section>
  );
}
