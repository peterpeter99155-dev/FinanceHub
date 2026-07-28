export type MoneyTone = 'positive' | 'negative' | 'neutral';

export function MoneyAmount({
  value,
  tone,
  sign,
}: {
  value: number;
  tone: MoneyTone;
  sign?: 'positive' | 'negative' | 'auto' | 'none';
}) {
  const resolvedSign =
    sign === 'positive'
      ? '＋'
      : sign === 'negative'
        ? '−'
        : sign === 'none'
          ? ''
          : value < 0
            ? '−'
            : '';
  const formatted = new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  return (
    <span className="money-amount">
      <span className="money-currency">TWD</span>{' '}
      <span className={`money-number ${tone}`}>
        {resolvedSign}
        {formatted}
      </span>
    </span>
  );
}
