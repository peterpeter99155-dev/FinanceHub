import type { FinancialItem } from '../../domain/financial-item';
import type { FinancialTransaction } from '../../domain/transaction';
import type { TransactionMonthSnapshot } from '../../shared/transactions';
import type { TransactionDateGroup } from '../transactionViewModel';
import { TransactionDayGroup } from './TransactionDayGroup';

export function TransactionList({
  accountById,
  editingId,
  groupedTransactions,
  isCurrentMonth,
  month,
  onChangeMonth,
  onDelete,
  onEdit,
  onLoadMore,
  snapshot,
  year,
}: {
  accountById: ReadonlyMap<string, FinancialItem>;
  editingId: string | null;
  groupedTransactions: readonly TransactionDateGroup[];
  isCurrentMonth: boolean;
  month: number;
  onChangeMonth: (offset: number) => void;
  onDelete: (transaction: FinancialTransaction) => void;
  onEdit: (transaction: FinancialTransaction) => void;
  onLoadMore: () => void;
  snapshot: TransactionMonthSnapshot | null;
  year: number;
}) {
  return (
    <section className="panel transaction-list-panel">
      <div className="section-heading">
        <div>
          <p className="label">交易流水</p>
          <h2>
            {year} 年 {month} 月
          </h2>
        </div>
        <div className="month-navigation">
          <button type="button" onClick={() => onChangeMonth(-1)}>
            上個月
          </button>
          <button
            disabled={isCurrentMonth}
            type="button"
            onClick={() => onChangeMonth(1)}
          >
            下個月
          </button>
        </div>
      </div>

      {!snapshot ? (
        <p className="transaction-empty">正在載入交易…</p>
      ) : snapshot.items.length === 0 ? (
        <p className="transaction-empty">這個月還沒有交易。</p>
      ) : (
        <div className="transaction-list">
          {groupedTransactions.map((group) => (
            <TransactionDayGroup
              accountById={accountById}
              editingId={editingId}
              group={group}
              key={group.key}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}

      {snapshot && snapshot.items.length < snapshot.totalCount && (
        <button
          className="load-more-button"
          type="button"
          onClick={onLoadMore}
        >
          載入更多
        </button>
      )}
    </section>
  );
}
