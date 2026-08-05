import type { FinancialItem } from '../../domain/financial-item';
import type { ImportHistoryState } from '../useImportHistory';
import {
  IMPORT_LABELS,
  importHistoryMonth,
  importHistoryStatus,
} from '../labels';

interface Props {
  readonly accounts: readonly FinancialItem[];
  readonly history: ImportHistoryState;
  readonly onRemove: (id: string) => void;
}

export function ImportHistory({ accounts, history, onRemove }: Props) {
  return (
    <section className="panel import-history">
      <div className="section-heading">
        <div><p className="label">{IMPORT_LABELS.historyEyebrow}</p><h2>{IMPORT_LABELS.historyTitle}</h2></div>
      </div>
      {history.loading && <p className="state-panel" role="status">{IMPORT_LABELS.historyLoading}</p>}
      {history.error && <div className="state-panel error" role="alert"><p>{history.error}</p><button className="secondary-button" type="button" onClick={history.reload}>{IMPORT_LABELS.historyRetry}</button></div>}
      {!history.loading && !history.error && history.items.length === 0 && <p className="empty-state">{IMPORT_LABELS.historyEmpty}</p>}
      <div className="import-history-list">
        {history.items.map(({ batch, candidateCount, pendingCount }) => (
          <article key={batch.id} className="import-history-item">
            <div>
              <strong>{importHistoryMonth(batch.statementMonth)}</strong>
              <span>{accounts.find(({ id }) => id === batch.creditCardAccountId)?.name ?? '信用卡'}</span>
              <small>{importHistoryStatus(pendingCount, candidateCount)}</small>
            </div>
            <div className="import-history-actions">
              <button
                className="secondary-button"
                disabled={history.openingId !== undefined}
                type="button"
                onClick={() => void history.open(batch.id)}
              >
                {history.openingId === batch.id ? IMPORT_LABELS.historyOpening : IMPORT_LABELS.historyOpen}
              </button>
              <button
                className="delete-button"
                disabled={history.openingId !== undefined}
                type="button"
                onClick={() => onRemove(batch.id)}
              >
                {IMPORT_LABELS.removeHistory}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
