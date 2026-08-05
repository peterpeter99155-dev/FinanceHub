import { IMPORT_LABELS } from '../labels';
import { IMPORT_MESSAGES } from '../messages';

interface Props {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ImportRemovalDialog({ busy, onCancel, onConfirm }: Props) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-describedby="import-removal-description"
        aria-labelledby="import-removal-title"
        aria-modal="true"
        className="confirm-dialog"
        role="alertdialog"
      >
        <p className="label">{IMPORT_LABELS.removeHistoryEyebrow}</p>
        <h2 id="import-removal-title">{IMPORT_LABELS.removeHistoryTitle}</h2>
        <p id="import-removal-description">{IMPORT_MESSAGES.removeHistoryDescription}</p>
        <div className="dialog-actions">
          <button
            autoFocus
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            {IMPORT_LABELS.cancel}
          </button>
          <button
            className="delete-button"
            disabled={busy}
            type="button"
            onClick={onConfirm}
          >
            {busy ? IMPORT_LABELS.removingHistory : IMPORT_LABELS.confirmRemoveHistory}
          </button>
        </div>
      </section>
    </div>
  );
}
