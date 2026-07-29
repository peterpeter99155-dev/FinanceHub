import type { FinancialItem } from '../../domain/financial-item';
import type { FinancialTransaction } from '../../domain/transaction';
import {
  dailyBalanceTone,
  formatDateHeading,
  formatTime,
  isSimpleKind,
  simpleKindLabel,
  transactionAccountFlow,
  transactionTone,
  type TransactionDateGroup,
} from '../transactionViewModel';
import { IconButton } from './IconButton';
import { MoneyAmount } from './MoneyAmount';

export function TransactionDayGroup({
  accountById,
  editingId,
  group,
  onDelete,
  onEdit,
}: {
  accountById: ReadonlyMap<string, FinancialItem>;
  editingId: string | null;
  group: TransactionDateGroup;
  onDelete: (transaction: FinancialTransaction) => void;
  onEdit: (transaction: FinancialTransaction) => void;
}) {
  return (
    <section className="transaction-day-group">
      <header className="transaction-day-heading">
        <div>
          <strong>{formatDateHeading(group.date)}</strong>
          <span>{group.items.length} 筆交易</span>
        </div>
        <p className={dailyBalanceTone(group.balance)}>
          當日收支{' '}
          <strong>
            <MoneyAmount
              value={group.balance}
              tone={
                group.balance > 0
                  ? 'positive'
                  : group.balance < 0
                    ? 'negative'
                    : 'neutral'
              }
              sign={group.balance > 0 ? 'positive' : 'auto'}
            />
          </strong>
        </p>
      </header>
      {group.items.map((transaction) => {
        const accountFlow = transactionAccountFlow(
          transaction,
          accountById,
        );
        return (
          <article
            className={`transaction-row ${
              editingId === transaction.id ? 'editing' : ''
            }`}
            key={transaction.id}
          >
            <span
              className={`transaction-kind ${transaction.kind}`}
            >
              {simpleKindLabel(transaction.kind)}
            </span>
            <div>
              <strong>
                {transaction.name}
                {editingId === transaction.id && (
                  <span className="editing-badge">編輯中</span>
                )}
              </strong>
              {accountFlow && (
                <span className="transaction-account-flow">
                  {accountFlow}
                </span>
              )}
              {transaction.note && (
                <span
                  className="transaction-note"
                  title={transaction.note}
                >
                  備註：{transaction.note}
                </span>
              )}
              <time dateTime={transaction.occurredAt}>
                {formatTime(transaction.occurredAt)}
              </time>
            </div>
            <strong
              className={`transaction-amount ${transactionTone(
                transaction.kind,
              )}`}
            >
              <MoneyAmount
                value={transaction.amount}
                tone={transactionTone(transaction.kind)}
                sign={
                  transaction.kind === 'income'
                    ? 'positive'
                    : transaction.kind === 'expense' ||
                        transaction.kind === 'credit_card_purchase'
                      ? 'negative'
                      : 'none'
                }
              />
            </strong>
            <div className="row-actions">
              {isSimpleKind(transaction.kind) && (
                <IconButton
                  icon="edit"
                  label={`編輯 ${transaction.name}`}
                  type="button"
                  onClick={() => onEdit(transaction)}
                />
              )}
              <IconButton
                icon="delete"
                label={`刪除 ${transaction.name}`}
                type="button"
                onClick={() => onDelete(transaction)}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
