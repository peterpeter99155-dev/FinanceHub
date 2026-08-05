import { useState } from 'react';

import type { FinancialCategory } from '../../domain/category';
import type { FinancialItem } from '../../domain/financial-item';
import type { ImportCandidate, SourceObservation } from '../../domain/import';
import type { FinancialTransaction } from '../../domain/transaction';
import type { ImportCandidateInsight } from '../../application/import-service';
import { formatTwd, importAmountInputPatch, importCandidateNeedsDecision, importCandidateReviewState, IMPORT_WARNING_LABELS, type ImportCandidateDraft } from '../importViewModel';
import { ImportLinkComparison } from './ImportLinkComparison';
import { IMPORT_LABELS, importCategorySuggestion } from '../labels';
import { BackupStatusFeedback, type BackupFeedback } from './BackupStatusFeedback';

interface Props {
  readonly candidate: ImportCandidate;
  readonly observation?: SourceObservation;
  readonly insight?: ImportCandidateInsight;
  readonly draft: ImportCandidateDraft;
  readonly cards: readonly FinancialItem[];
  readonly categories: readonly FinancialCategory[];
  readonly transactions: readonly FinancialTransaction[];
  readonly busy: boolean;
  readonly feedback?: BackupFeedback;
  readonly onChange: (patch: Partial<ImportCandidateDraft>) => void;
  readonly onConfirm: () => void;
}

export function ImportCandidateCard(props: Props) {
  const resolved = props.candidate.decision !== undefined;
  const [expanded, setExpanded] = useState(false);
  const needsDecision = importCandidateNeedsDecision(props.insight);
  const reviewState = importCandidateReviewState(
    props.observation,
    props.observation?.warningCodes,
    props.draft,
  );
  const categoryName = props.categories.find(({ id }) => id === props.draft.categoryId)?.name ?? IMPORT_LABELS.fallbackCategory;
  const cardName = props.cards.find(({ id }) => id === props.draft.creditCardAccountId)?.name ?? IMPORT_LABELS.fallbackCreditCard;
  return (
    <article className={`import-candidate ${resolved ? 'resolved' : ''}`} data-testid="import-candidate">
      <header className="import-candidate-row">
        <div><span className="label">{IMPORT_LABELS.date}</span><strong>{props.draft.date}</strong><small>{IMPORT_LABELS.unknownTime}</small></div>
        <div><span className="label">{IMPORT_LABELS.amount}</span><strong>{formatTwd(Number(props.draft.amount) || 0)}</strong></div>
        <div className="import-candidate-summary"><span className="label">{IMPORT_LABELS.summary}</span><strong>{props.draft.name || IMPORT_LABELS.missingSummary}</strong></div>
        <div><span className="label">{IMPORT_LABELS.category}</span><strong>{categoryName}</strong></div>
        <div><span className="label">{IMPORT_LABELS.creditCard}</span><strong>{cardName}</strong></div>
        {resolved && <span className="status-chip">{IMPORT_LABELS.resolved}：{decisionLabel(props.candidate.decision!)}</span>}
        {!resolved && needsDecision && !props.draft.decision && <span className="status-chip warning">{IMPORT_LABELS.duplicateDecisionRequired}</span>}
        {!resolved && !needsDecision && reviewState === 'needs_review' && <span className="status-chip warning">{IMPORT_LABELS.contentReviewRequired}</span>}
        {!resolved && !needsDecision && reviewState === 'reviewed' && <span className="status-chip reviewed">{IMPORT_LABELS.contentReviewed}</span>}
        <button className="secondary-button import-expand-button" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? IMPORT_LABELS.collapseCandidate : IMPORT_LABELS.expandCandidate}</button>
      </header>
      {expanded && <div className="import-candidate-details">
      {props.feedback && <BackupStatusFeedback feedback={props.feedback} />}
      {reviewState === 'needs_review' && props.observation?.warningCodes.map((code) => <p className="import-warning" key={code}>! {IMPORT_WARNING_LABELS[code] ?? IMPORT_LABELS.fallbackReviewWarning}</p>)}
      {reviewState === 'reviewed' && <p className="import-reviewed">✓ {IMPORT_LABELS.contentReviewedHelp}</p>}
      {props.insight && (props.insight.duplicateObservationCount > 0 || props.insight.matches.length > 0) && <div className="import-suggestion" data-testid="duplicate-suggestion"><strong>{IMPORT_LABELS.duplicateTitle}</strong><p>{IMPORT_LABELS.duplicateHelp}</p>{props.insight.matches.map(({ transaction }) => <button className="secondary-button" key={transaction.id} type="button" disabled={resolved} onClick={() => props.onChange({ decision: 'link_existing', existingTransactionId: transaction.id })}>{IMPORT_LABELS.compareAndLink}：{transaction.name}</button>)}</div>}
      {props.insight?.categorySuggestion && <div className="import-suggestion" data-testid="category-suggestion"><span>{importCategorySuggestion(props.insight.categorySuggestion.evidenceCount, props.categories.find(({ id }) => id === props.insight?.categorySuggestion?.categoryId)?.name ?? IMPORT_LABELS.unknownCategory)}</span><button className="secondary-button" type="button" disabled={resolved} onClick={() => props.onChange({ categoryId: props.insight!.categorySuggestion!.categoryId })}>{IMPORT_LABELS.applySuggestion}</button></div>}
      <div className="import-edit-grid">
        <label>日期<input type="date" value={props.draft.date} disabled={resolved} onChange={(event) => props.onChange({ date: event.target.value })} /></label>
        <label>{IMPORT_LABELS.amountField}<input inputMode="numeric" value={props.draft.amount} disabled={resolved} onChange={(event) => props.onChange(importAmountInputPatch(event.target.value))} /><small>{IMPORT_LABELS.negativeAmountHelp}</small></label>
        <label>{IMPORT_LABELS.transactionKind}<select data-testid="candidate-kind" value={props.draft.kind} disabled={resolved} onChange={(event) => { const kind = event.target.value as ImportCandidateDraft['kind']; props.onChange({ kind, amount: kind === 'credit_card_purchase' ? props.draft.amount.replace('-', '') : props.draft.amount }); }}>
          <option value="">{IMPORT_LABELS.choose}</option><option value="credit_card_purchase">信用卡消費</option><option value="credit_card_refund">信用卡退款</option>
        </select></label>
        <label>{IMPORT_LABELS.summaryField}<input maxLength={50} value={props.draft.name} disabled={resolved} onChange={(event) => props.onChange({ name: event.target.value })} /></label>
        <label>信用卡<select value={props.draft.creditCardAccountId} disabled={resolved} onChange={(event) => props.onChange({ creditCardAccountId: event.target.value })}>{props.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
        <label>{IMPORT_LABELS.expenseCategory}<select value={props.draft.categoryId} disabled={resolved} onChange={(event) => props.onChange({ categoryId: event.target.value })}>{props.categories.filter((category) => category.kind === 'expense' && category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>
      {!resolved && <>
        {needsDecision && <>
        <fieldset className="import-decision"><legend>{IMPORT_LABELS.decisionQuestion}</legend>
          {(['create_new', 'link_existing', 'exclude'] as const).map((decision) => <label key={decision}><input type="radio" name={`decision-${props.candidate.id}`} checked={props.draft.decision === decision} onChange={() => props.onChange({ decision })} />{decisionLabel(decision)}</label>)}
        </fieldset>
        </>}
        {props.draft.decision === 'link_existing' && <ImportLinkComparison draft={props.draft} transactions={props.transactions} cards={props.cards} categories={props.categories} onSelect={(existingTransactionId) => props.onChange({ existingTransactionId })} />}
        <button className="primary-button" type="button" disabled={props.busy} onClick={props.onConfirm}>{IMPORT_LABELS.confirmCandidate}</button>
      </>}
      </div>}
    </article>
  );
}

function decisionLabel(decision: 'create_new' | 'link_existing' | 'exclude') {
  return decision === 'create_new' ? IMPORT_LABELS.createNew : decision === 'link_existing' ? IMPORT_LABELS.linkExisting : IMPORT_LABELS.exclude;
}
