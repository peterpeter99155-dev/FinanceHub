import { formatBackupTime } from '../backupViewModel';

interface BackupReplacementDialogProps {
  readonly oldestSuccessfulAt?: string;
  readonly removalCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function BackupReplacementDialog({
  oldestSuccessfulAt,
  removalCount,
  onCancel,
  onConfirm,
}: BackupReplacementDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="backup-replacement-title"
        aria-modal="true"
        className="panel backup-replacement-dialog"
        role="dialog"
      >
        <p className="label">確認立即備份</p>
        <h2 id="backup-replacement-title">
          建立新備份後，將移除最舊的 {removalCount} 份備份
        </h2>
        <p>
          最舊備份：{formatBackupTime(oldestSuccessfulAt)}
        </p>
        <p>
          FinanceHub 會先確認新備份完整可用，成功後才會移除舊備份。
          如果新備份失敗，舊備份不會改變。
        </p>
        <div className="dialog-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onConfirm}
          >
            繼續備份
          </button>
        </div>
      </section>
    </div>
  );
}
