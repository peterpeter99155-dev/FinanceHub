import { useEffect, useState } from 'react';

import type {
  ImportBatchHistoryItem,
  ImportBatchSnapshot,
} from '../../application/import-service';
import type { FinancialItem } from '../../domain/financial-item';

interface Props {
  readonly accounts: readonly FinancialItem[];
  readonly refreshKey?: string;
  readonly onOpen: (snapshot: ImportBatchSnapshot) => Promise<void>;
}

export function ImportHistory({ accounts, refreshKey, onOpen }: Props) {
  const [items, setItems] = useState<readonly ImportBatchHistoryItem[]>([]);

  useEffect(() => {
    void window.financeHub.imports.listBatches().then(setItems);
  }, [refreshKey]);

  if (items.length === 0) return null;
  return (
    <section className="panel import-history">
      <div className="section-heading">
        <div><p className="label">已解析帳單</p><h2>匯入紀錄</h2></div>
      </div>
      <div className="import-history-list">
        {items.map(({ batch, candidateCount, pendingCount }) => (
          <article key={batch.id} className="import-history-item">
            <div>
              <strong>{batch.statementMonth.replace('-', ' 年 ')} 月</strong>
              <span>{accounts.find(({ id }) => id === batch.creditCardAccountId)?.name ?? '信用卡'}</span>
              <small>{pendingCount > 0 ? `待確認 ${pendingCount} 筆` : `已處理 ${candidateCount} 筆`}</small>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void window.financeHub.imports.getBatch(batch.id).then(onOpen)}
            >
              查看內容
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
