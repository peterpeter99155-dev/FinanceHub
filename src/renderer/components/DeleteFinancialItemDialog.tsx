import type { FinancialItem } from '../../domain/financial-item';

export function DeleteFinancialItemDialog({
  isDeleting,
  item,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  item: FinancialItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby="delete-dialog-description"
        aria-labelledby="delete-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="alertdialog"
      >
        <p className="label">確認刪除</p>
        <h2 id="delete-dialog-title">
          永久刪除「{item.name}」？
        </h2>
        <p id="delete-dialog-description">
          刪除後無法復原，這筆資料也不會再列入首頁總額。
        </p>
        <div className="dialog-actions">
          <button
            autoFocus
            className="secondary-button"
            disabled={isDeleting}
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="delete-button"
            disabled={isDeleting}
            type="button"
            onClick={onConfirm}
          >
            {isDeleting ? '刪除中…' : '永久刪除'}
          </button>
        </div>
      </section>
    </div>
  );
}
