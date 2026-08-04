import type { FinancialCategory } from '../../domain/category';
import type { FinancialItem } from '../../domain/financial-item';
import type { ImportCandidate, SourceObservation } from '../../domain/import';
import type { FinancialTransaction } from '../../domain/transaction';
import { IMPORT_WARNING_LABELS, type ImportCandidateDraft } from '../importViewModel';
import { ImportLinkComparison } from './ImportLinkComparison';

interface Props {
  readonly candidate: ImportCandidate;
  readonly observation?: SourceObservation;
  readonly draft: ImportCandidateDraft;
  readonly cards: readonly FinancialItem[];
  readonly categories: readonly FinancialCategory[];
  readonly transactions: readonly FinancialTransaction[];
  readonly busy: boolean;
  readonly onChange: (patch: Partial<ImportCandidateDraft>) => void;
  readonly onConfirm: () => void;
}

export function ImportCandidateCard(props: Props) {
  const resolved = props.candidate.decision !== undefined;
  return (
    <article className={`import-candidate ${resolved ? 'resolved' : ''}`} data-testid="import-candidate">
      <header><div><span className="label">交易日期</span><strong>{props.draft.date}・時間未知</strong></div>{resolved && <span className="status-chip">已處理：{decisionLabel(props.candidate.decision!)}</span>}</header>
      {props.observation?.warningCodes.map((code) => <p className="import-warning" key={code}>! {IMPORT_WARNING_LABELS[code] ?? '這筆資料需要人工檢查。'}</p>)}
      <div className="import-edit-grid">
        <label>日期<input type="date" value={props.draft.date} disabled={resolved} onChange={(event) => props.onChange({ date: event.target.value })} /></label>
        <label>金額（TWD）<input inputMode="numeric" value={props.draft.amount} disabled={resolved} onChange={(event) => props.onChange({ amount: event.target.value.replace(/\D/g, '') })} /></label>
        <label>交易語意<select data-testid="candidate-kind" value={props.draft.kind} disabled={resolved} onChange={(event) => props.onChange({ kind: event.target.value as ImportCandidateDraft['kind'] })}>
          <option value="">請選擇</option><option value="credit_card_purchase">信用卡消費</option><option value="credit_card_refund">信用卡退款</option>
        </select></label>
        <label>摘要<input maxLength={50} value={props.draft.name} disabled={resolved} onChange={(event) => props.onChange({ name: event.target.value })} /></label>
        <label>信用卡<select value={props.draft.creditCardAccountId} disabled={resolved} onChange={(event) => props.onChange({ creditCardAccountId: event.target.value })}>{props.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
        <label>支出分類<select value={props.draft.categoryId} disabled={resolved} onChange={(event) => props.onChange({ categoryId: event.target.value })}>{props.categories.filter((category) => category.kind === 'expense' && category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>
      {!resolved && <>
        <fieldset className="import-decision"><legend>這筆資料要怎麼處理？</legend>
          {(['create_new', 'link_existing', 'exclude'] as const).map((decision) => <label key={decision}><input type="radio" name={`decision-${props.candidate.id}`} checked={props.draft.decision === decision} onChange={() => props.onChange({ decision })} />{decisionLabel(decision)}</label>)}
        </fieldset>
        {props.draft.decision === 'link_existing' && <ImportLinkComparison draft={props.draft} transactions={props.transactions} cards={props.cards} categories={props.categories} onSelect={(existingTransactionId) => props.onChange({ existingTransactionId })} />}
        <button type="button" disabled={props.busy} onClick={props.onConfirm}>確認此筆</button>
      </>}
    </article>
  );
}

function decisionLabel(decision: 'create_new' | 'link_existing' | 'exclude') {
  return decision === 'create_new' ? '建立新交易' : decision === 'link_existing' ? '連結既有交易' : '排除';
}
