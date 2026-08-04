import type { FinancialTransaction } from '../../domain/transaction';
import type { FinancialItem } from '../../domain/financial-item';
import type { FinancialCategory } from '../../domain/category';
import type { ImportCandidateDraft } from '../importViewModel';
import { formatTwd } from '../importViewModel';
import { TRANSACTION_KIND_LABELS } from '../labels';

interface Props { readonly draft: ImportCandidateDraft; readonly transactions: readonly FinancialTransaction[]; readonly cards: readonly FinancialItem[]; readonly categories: readonly FinancialCategory[]; readonly onSelect: (id: string) => void; }

export function ImportLinkComparison({ draft, transactions, cards, categories, onSelect }: Props) {
  const selected = transactions.find((item) => item.id === draft.existingTransactionId);
  return (
    <div className="import-link-panel">
      <label>既有交易<select data-testid="existing-transaction" value={draft.existingTransactionId} onChange={(event) => onSelect(event.target.value)}>
        <option value="">請選擇既有交易</option>
        {transactions.map((item) => <option key={item.id} value={item.id}>{item.occurredAt.slice(0, 10)}・{item.name}・{formatTwd(item.amount)}</option>)}
      </select></label>
      {selected && <dl className="import-differences" data-testid="import-differences">
        <Difference label="日期" candidate={draft.date} existing={selected.occurredAt.slice(0, 10)} />
        <Difference label="金額" candidate={formatTwd(Number(draft.amount))} existing={formatTwd(selected.amount)} />
        <Difference label="交易語意" candidate={draft.kind ? TRANSACTION_KIND_LABELS[draft.kind] : '未指定'} existing={TRANSACTION_KIND_LABELS[selected.kind]} />
        <Difference label="摘要" candidate={draft.name} existing={selected.name} />
        <Difference label="信用卡" candidate={labelById(cards, draft.creditCardAccountId)} existing={labelById(cards, selected.destinationAccountId)} />
        <Difference label="分類" candidate={labelById(categories, draft.categoryId)} existing={labelById(categories, selected.categoryId)} />
      </dl>}
      <small>連結只建立來源關聯，不會修改既有交易。</small>
    </div>
  );
}

function labelById(entries: readonly { readonly id: string; readonly name: string }[], id?: string) {
  return entries.find((item) => item.id === id)?.name ?? '未指定';
}

function Difference({ label, candidate, existing }: { readonly label: string; readonly candidate: string; readonly existing: string }) {
  return <div className={candidate === existing ? '' : 'different'}><dt>{label}</dt><dd>帳單：{candidate}</dd><dd>既有：{existing}</dd></div>;
}
