import type {
  FinancialItem,
  FinancialItemDirection,
} from '../../domain/financial-item';
import { STATUS_LABELS } from '../labels';
import { IconButton } from './IconButton';
import { MoneyAmount } from './MoneyAmount';

export function SummaryCard({
  label,
  value,
  featured = false,
  tone = 'neutral',
  testId,
}: {
  label: string;
  value: number;
  featured?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
  testId: string;
}) {
  return (
    <article
      className={`summary-card ${featured ? 'featured' : ''} ${tone}`}
      data-testid={testId}
    >
      <span>{label}</span>
      <strong>
        <MoneyAmount value={value} tone={tone} />
      </strong>
    </article>
  );
}

export function FinancialItemGroup({
  direction,
  editingId,
  emptyMessage,
  items,
  onDelete,
  onEdit,
  typeLabel,
  title,
  total,
}: {
  direction: FinancialItemDirection;
  editingId: string | null;
  emptyMessage: string;
  items: readonly FinancialItem[];
  onDelete: (item: FinancialItem) => void;
  onEdit: (item: FinancialItem) => void;
  typeLabel: (item: FinancialItem) => string;
  title: string;
  total: number;
}) {
  return (
    <section
      aria-labelledby={`${direction}-group-title`}
      className={`financial-group ${direction}`}
      data-testid={`${direction}-group`}
    >
      <header className="group-heading">
        <div>
          <span className={`group-marker ${direction}`} />
          <h3 id={`${direction}-group-title`}>{title}</h3>
        </div>
        <p>
          列入首頁{' '}
          <strong>
            <MoneyAmount
              value={total}
              tone={direction === 'asset' ? 'positive' : 'negative'}
            />
          </strong>
        </p>
      </header>

      {items.length === 0 ? (
        <div className="group-empty">
          <strong>{emptyMessage}</strong>
          <span>可從右側表單新增。</span>
        </div>
      ) : (
        <div className="item-list">
          {items.map((item) => (
            <article
              className={`item-row ${
                editingId === item.id ? 'editing' : ''
              }`}
              data-testid={`financial-item-${item.id}`}
              key={item.id}
            >
              <div className={`direction-dot ${item.direction}`} />
              <div className="item-main">
                <strong>
                  {item.name}
                  {editingId === item.id && (
                    <span className="editing-badge">編輯中</span>
                  )}
                </strong>
                <span>
                  {typeLabel(item)} · {STATUS_LABELS[item.status]}
                  {!item.includeInNetWorth && ' · 不列入首頁'}
                </span>
              </div>
              <div
                className={`item-value ${
                  item.direction === 'asset' ? 'positive' : 'negative'
                }`}
              >
                <strong>
                  <MoneyAmount
                    value={item.amount}
                    tone={
                      item.direction === 'asset'
                        ? 'positive'
                        : 'negative'
                    }
                  />
                </strong>
                <time dateTime={item.updatedAt}>
                  {formatUpdatedAt(item.updatedAt)}
                </time>
              </div>
              <div className="row-actions">
                <IconButton
                  icon="edit"
                  label={`編輯 ${item.name}`}
                  type="button"
                  onClick={() => onEdit(item)}
                />
                <IconButton
                  icon="delete"
                  label={`刪除 ${item.name}`}
                  type="button"
                  onClick={() => onDelete(item)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
