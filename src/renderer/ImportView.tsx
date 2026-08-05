import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ImportBatchSnapshot, ImportCandidateUpdate } from '../application/import-service';
import type { FinancialCategory } from '../domain/category';
import type { FinancialItem } from '../domain/financial-item';
import type { CandidateDecision, ImportCandidate } from '../domain/import';
import type { FinancialTransaction } from '../domain/transaction';
import type { ImportFileSelection } from '../shared/imports';
import { BackupStatusFeedback, type BackupFeedback } from './components/BackupStatusFeedback';
import { ImportBatchSummary } from './components/ImportBatchSummary';
import { ImportCandidateCard } from './components/ImportCandidateCard';
import { ImportSourceForm } from './components/ImportSourceForm';
import { ImportHistory } from './components/ImportHistory';
import { ImportRemovalDialog } from './components/ImportRemovalDialog';
import { activeCreditCards, dateOnlyToTaipeiNoon, draftFromCandidate, importCandidateNeedsDecision, persistedImportAmount, type ImportCandidateDraft } from './importViewModel';
import { IMPORT_MESSAGES, importErrorMessage, importPartialConfirmationMessage, importReconciliationBlockedMessage } from './messages';
import { IMPORT_LABELS } from './labels';
import { useImportHistory } from './useImportHistory';
import { ERROR_CODES, errorCodeOf } from '../shared/errors';

interface Props { readonly accounts: readonly FinancialItem[]; readonly onBalancesChanged: () => Promise<void>; }
interface UiState { readonly busy: boolean; readonly feedback?: BackupFeedback; readonly feedbackTarget?: string; readonly removalId?: string; }

export function ImportView({ accounts, onBalancesChanged }: Props) {
  const cards = useMemo(() => activeCreditCards(accounts), [accounts]);
  const [selection, setSelection] = useState<ImportFileSelection | null>(null);
  const [password, setPassword] = useState('');
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [snapshot, setSnapshot] = useState<ImportBatchSnapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ImportCandidateDraft>>({});
  const [categories, setCategories] = useState<readonly FinancialCategory[]>([]);
  const [transactions, setTransactions] = useState<readonly FinancialTransaction[]>([]);
  const [ui, setUi] = useState<UiState>({ busy: false });
  const feedbackTimer = useRef<number | null>(null);
  const reconciliationRef = useRef<HTMLDivElement>(null);
  const history = useImportHistory(snapshot?.batch.id, loadSnapshot);

  useEffect(() => { void window.financeHub.categories.list().then(setCategories); }, []);
  useEffect(() => { if (!cardId && cards[0]) setCardId(cards[0].id); }, [cardId, cards]);
  useEffect(() => () => { if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current); }, []);
  useLayoutEffect(() => {
    if (ui.feedbackTarget === 'reconciliation') {
      reconciliationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [ui.feedbackTarget]);

  function showFeedback(feedback: BackupFeedback, feedbackTarget?: string) {
    setUi((current) => ({ ...current, feedback, feedbackTarget }));
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    if (feedback.tone === 'success') feedbackTimer.current = window.setTimeout(() => setUi((current) => ({ ...current, feedback: undefined })), 3_000);
  }

  async function selectFile() {
    setUi({ busy: true });
    try { setSelection(await window.financeHub.imports.selectStatementFile()); }
    catch (error) { showFeedback({ tone: 'error', message: importErrorMessage(error) }); }
    finally { setUi((current) => ({ ...current, busy: false })); }
  }

  async function parseStatement() {
    if (selection?.status !== 'selected') return;
    setUi({ busy: true });
    try {
      const next = await window.financeHub.imports.parseSelectedStatement(selection.selectionToken, password, cardId);
      setPassword('');
      await loadSnapshot(next);
      showFeedback({
        tone: next.wasAlreadyImported ? 'warning' : 'success',
        message: next.wasAlreadyImported
          ? IMPORT_MESSAGES.alreadyImported
          : IMPORT_MESSAGES.parsed,
      });
    } catch (error) {
      setPassword('');
      showFeedback({ tone: 'error', message: importErrorMessage(error) });
    } finally { setUi((current) => ({ ...current, busy: false })); }
  }

  async function createCreditCard(name: string): Promise<FinancialItem> {
    const existingIds = new Set(accounts.map(({ id }) => id));
    const next = await window.financeHub.financialItems.create({
      name,
      direction: 'liability',
      type: 'credit_card',
      amount: 0,
      status: 'confirmed',
      includeInNetWorth: true,
    });
    const created = next.items.find(({ id }) => !existingIds.has(id));
    if (!created) throw { code: 'UNKNOWN' };
    setCardId(created.id);
    await onBalancesChanged();
    return created;
  }

  async function removeImportHistory() {
    const id = ui.removalId;
    if (!id) return;
    setUi((current) => ({ ...current, busy: true }));
    try {
      await window.financeHub.imports.removeBatch(id);
      if (snapshot?.batch.id === id) {
        setSnapshot(null);
        setDrafts({});
      }
      history.reload();
      setUi({ busy: false });
      showFeedback({ tone: 'success', message: IMPORT_MESSAGES.historyRemoved });
    } catch (error) {
      setUi({ busy: false });
      showFeedback({ tone: 'error', message: importErrorMessage(error) });
    }
  }

  async function loadSnapshot(next: ImportBatchSnapshot) {
    setSnapshot(next);
    setDrafts(Object.fromEntries(next.candidates.map((item) => {
      const insight = next.insights.find(({ candidateId }) => candidateId === item.id);
      return [item.id, draftFromCandidate(item, insight)];
    })));
    const [year, month] = next.batch.statementMonth.split('-').map(Number);
    const existing = await window.financeHub.transactions.listMonth(year, month);
    const suggested = next.insights.flatMap((insight) =>
      insight.matches.map(({ transaction }) => transaction),
    );
    setTransactions(
      [...existing.items, ...suggested].filter(
        (item, index, all) =>
          all.findIndex(({ id }) => id === item.id) === index,
      ),
    );
  }

  function changeDraft(id: string, patch: Partial<ImportCandidateDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function persistDraft(candidate: ImportCandidate, draft: ImportCandidateDraft) {
    if (draft.decision !== 'create_new') return;
    const amount = persistedImportAmount(draft.amount);
    if (!draft.kind || !draft.date || !draft.creditCardAccountId || amount <= 0) throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
    const update: ImportCandidateUpdate = { kind: draft.kind, amount, occurredAt: dateOnlyToTaipeiNoon(draft.date), occurredAtPrecision: 'date', name: draft.name.trim(), creditCardAccountId: draft.creditCardAccountId, categoryId: draft.categoryId || undefined };
    await window.financeHub.imports.updateCandidate(candidate.id, update);
  }

  function decisionFor(candidate: ImportCandidate, draft: ImportCandidateDraft): CandidateDecision {
    if (!draft.decision) throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
    const insight = snapshot?.insights.find(({ candidateId }) => candidateId === candidate.id);
    return {
      candidateId: candidate.id,
      decision: draft.decision,
      existingTransactionId: draft.decision === 'link_existing' ? draft.existingTransactionId : undefined,
      duplicateDecisionConfirmed: importCandidateNeedsDecision(insight) ? true : undefined,
    };
  }

  async function confirm(candidateIds: readonly string[]) {
    if (!snapshot) return;
    setUi({ busy: true });
    try {
      const requested = snapshot.candidates.filter((item) => candidateIds.includes(item.id) && !item.decision);
      const candidates = requested.filter((item) => {
        const insight = snapshot.insights.find(({ candidateId }) => candidateId === item.id);
        return !importCandidateNeedsDecision(insight) || Boolean(drafts[item.id].decision);
      });
      const skippedCount = requested.length - candidates.length;
      if (candidates.length === 0) {
        showFeedback({ tone: 'warning', message: IMPORT_MESSAGES.duplicateDecisionRequired });
        return;
      }
      for (const candidate of candidates) await persistDraft(candidate, drafts[candidate.id]);
      const decisions = candidates.map((candidate) => decisionFor(candidate, drafts[candidate.id]));
      if (decisions.some((item) => item.decision === 'link_existing' && !item.existingTransactionId)) throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
      const next = await window.financeHub.imports.confirmCandidates(snapshot.batch.id, decisions);
      await loadSnapshot(next);
      await onBalancesChanged();
      showFeedback(skippedCount > 0
        ? { tone: 'warning', message: importPartialConfirmationMessage(candidates.length, skippedCount) }
        : { tone: 'success', message: candidateIds.length === 1 ? IMPORT_MESSAGES.candidateConfirmed : IMPORT_MESSAGES.batchConfirmed },
      candidateIds.length === 1 ? candidateIds[0] : undefined);
    } catch (error) {
      let latest = snapshot;
      try {
        latest = await window.financeHub.imports.getBatch(snapshot.batch.id);
        await loadSnapshot(latest);
      } catch {
        // Preserve the original confirmation error when status refresh also fails.
      }
      const reconciliationMismatch =
        errorCodeOf(error) === ERROR_CODES.importReconciliationMismatch;
      showFeedback({
        tone: 'error',
        message: reconciliationMismatch
          ? importReconciliationBlockedMessage(
            latest.reconciliationDifference,
            candidateIds.length === 1,
          )
          : importErrorMessage(error),
      }, reconciliationMismatch
        ? 'reconciliation'
        : candidateIds.length === 1
          ? candidateIds[0]
          : undefined);
    }
    finally { setUi((current) => ({ ...current, busy: false })); }
  }

  const pendingIds = snapshot?.candidates.filter((item) => !item.decision).map((item) => item.id) ?? [];
  return (
    <section className="import-view">
      <div className="page-heading"><div><p className="label">{IMPORT_LABELS.pageEyebrow}</p><h2>{IMPORT_LABELS.pageTitle}</h2></div></div>
      <div className="import-feedback-slot">{ui.feedback && !ui.feedbackTarget && <BackupStatusFeedback feedback={ui.feedback} />}</div>
      <ImportSourceForm cards={cards} selection={selection} password={password} cardId={cardId} busy={ui.busy} onCardId={setCardId} onPassword={setPassword} onSelect={() => void selectFile()} onParse={() => void parseStatement()} onCreateCard={createCreditCard} />
      <ImportHistory
        accounts={accounts}
        history={history}
        onRemove={(removalId) => setUi((current) => ({ ...current, removalId }))}
      />
      {snapshot && <><div ref={reconciliationRef}><ImportBatchSummary snapshot={snapshot} feedback={ui.feedbackTarget === 'reconciliation' ? ui.feedback : undefined} /></div><div className="import-list-heading"><div><h2>{IMPORT_LABELS.batchTitle}</h2><p>{IMPORT_LABELS.batchHelp}</p></div><button className="primary-button" type="button" disabled={ui.busy || pendingIds.length === 0} onClick={() => void confirm(pendingIds)}>{IMPORT_LABELS.confirmEligible}</button></div>
        {snapshot.candidates.length === 0 ? <p className="empty-state import-candidate-empty">{IMPORT_LABELS.batchEmpty}</p> : <div className="import-candidate-list">{snapshot.candidates.map((candidate) => <ImportCandidateCard key={candidate.id} candidate={candidate} insight={snapshot.insights.find((item) => item.candidateId === candidate.id)} observation={snapshot.observations.find((item) => item.id === candidate.observationId)} draft={drafts[candidate.id]} cards={cards} categories={categories} transactions={transactions} busy={ui.busy} feedback={ui.feedbackTarget === candidate.id ? ui.feedback : undefined} onChange={(patch) => changeDraft(candidate.id, patch)} onConfirm={() => void confirm([candidate.id])} />)}</div>}</>}
      {ui.removalId && (
        <ImportRemovalDialog
          busy={ui.busy}
          onCancel={() => setUi((current) => ({ ...current, removalId: undefined }))}
          onConfirm={() => void removeImportHistory()}
        />
      )}
    </section>
  );
}
