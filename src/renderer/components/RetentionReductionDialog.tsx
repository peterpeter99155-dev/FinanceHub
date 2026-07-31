import { formatBackupTime } from '../backupViewModel';

interface RetentionReductionDialogProps {
  readonly oldestSuccessfulAt?: string;
  readonly removalCount: number;
  readonly retentionCount: 3 | 7 | 14 | 30;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function RetentionReductionDialog({
  oldestSuccessfulAt,
  removalCount,
  retentionCount,
  onCancel,
  onConfirm,
}: RetentionReductionDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="retention-reduction-title"
        aria-modal="true"
        className="panel backup-replacement-dialog"
        role="dialog"
      >
        <p className="label">確認保留份數</p>
        <h2 id="retention-reduction-title">
          將保留份數改為 {retentionCount} 份
        </h2>
        <p>
          套用後將移除最舊的 {removalCount} 份備份。
          最舊備份：{formatBackupTime(oldestSuccessfulAt)}
        </p>
        <p>
          FinanceHub 會重新驗證準備清理的備份，再以安全方式移除。
          取消時會維持原本的保留份數。
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
            className="delete-button"
            type="button"
            onClick={onConfirm}
          >
            套用並移除舊備份
          </button>
        </div>
      </section>
    </div>
  );
}
