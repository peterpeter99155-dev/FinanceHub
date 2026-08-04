import type { ImportBatchSnapshot } from '../../application/import-service';
import { formatTwd } from '../importViewModel';

export function ImportBatchSummary({ snapshot }: { readonly snapshot: ImportBatchSnapshot }) {
  const excluded = snapshot.candidates.filter((item) => item.decision === 'exclude').length;
  const special = snapshot.observations.filter((item) => item.warningCodes.length > 0 || !item.kind).length;
  const reconciled = snapshot.batch.statementDetailTotal === snapshot.batch.parsedDetailTotal;
  return (
    <section className="panel import-batch-summary" aria-label="帳單匯入摘要">
      <div><span>來源</span><strong>永豐信用卡月結帳單</strong></div>
      <div><span>帳單月份</span><strong>{snapshot.batch.statementMonth}</strong></div>
      <div><span>待確認</span><strong>{snapshot.candidates.filter((item) => !item.decision).length} 筆</strong></div>
      <div><span>排除／特殊檢查</span><strong>{excluded}／{special} 筆</strong></div>
      <div><span>帳單總額核對</span><strong data-testid="import-reconciliation">{reconciled ? '一致' : '不一致'}・{formatTwd(snapshot.batch.statementDetailTotal)}</strong></div>
    </section>
  );
}
