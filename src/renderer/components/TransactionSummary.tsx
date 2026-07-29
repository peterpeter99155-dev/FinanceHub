import { MoneyAmount } from './MoneyAmount';

export function TransactionSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'balance';
}) {
  const balanceTone =
    tone === 'balance'
      ? value > 0
        ? 'positive'
        : value < 0
          ? 'negative'
          : 'neutral'
      : '';

  return (
    <article
      className={`transaction-summary-card ${tone} ${balanceTone}`}
    >
      <span>{label}</span>
      <strong>
        <MoneyAmount
          value={value}
          tone={
            tone === 'income'
              ? 'positive'
              : tone === 'expense'
                ? 'negative'
                : value > 0
                  ? 'positive'
                  : value < 0
                    ? 'negative'
                    : 'neutral'
          }
          sign={
            tone === 'income' && value > 0
              ? 'positive'
              : tone === 'expense' && value > 0
                ? 'negative'
                : tone === 'balance' && value > 0
                  ? 'positive'
                  : 'auto'
          }
        />
      </strong>
    </article>
  );
}
