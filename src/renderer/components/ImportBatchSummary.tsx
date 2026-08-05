import type { ImportBatchSnapshot } from '../../application/import-service';
import { formatTwd } from '../importViewModel';
import { IMPORT_LABELS } from '../labels';
import { BackupStatusFeedback, type BackupFeedback } from './BackupStatusFeedback';

export function ImportBatchSummary({ snapshot, feedback }: { readonly snapshot: ImportBatchSnapshot; readonly feedback?: BackupFeedback }) {
  const excluded = snapshot.candidates.filter((item) => item.decision === 'exclude').length;
  const special = snapshot.observations.filter((item) => item.warningCodes.length > 0 || !item.kind).length;
  return (
    <section className="panel import-batch-summary" aria-label="帳單匯入摘要">
      {feedback && <div className="import-summary-feedback"><BackupStatusFeedback feedback={feedback} /></div>}
      <div><span>{IMPORT_LABELS.source}</span><strong>{IMPORT_LABELS.supportedSourceName}</strong></div>
      <div><span>{IMPORT_LABELS.statementMonth}</span><strong>{snapshot.batch.statementMonth}</strong></div>
      <div><span>{IMPORT_LABELS.pending}</span><strong>{snapshot.candidates.filter((item) => !item.decision).length} 筆</strong></div>
      <div><span>{IMPORT_LABELS.excludedOrReview}</span><strong>{excluded}／{special} 筆</strong></div>
      <div><span>{IMPORT_LABELS.reconciliation}</span><strong data-testid="import-reconciliation">{snapshot.isReconciled ? IMPORT_LABELS.matched : IMPORT_LABELS.mismatched}</strong></div>
      <div><span>{IMPORT_LABELS.statementTotal}</span><strong>{formatTwd(snapshot.batch.statementDetailTotal)}</strong></div>
      <div><span>{IMPORT_LABELS.reviewedTotal}</span><strong>{formatTwd(snapshot.reviewedDetailTotal)}</strong></div>
      {!snapshot.isReconciled && <div><span>{IMPORT_LABELS.reconciliationDifference}</span><strong>{formatTwd(snapshot.reconciliationDifference)}</strong></div>}
    </section>
  );
}
