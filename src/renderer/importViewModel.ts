import type { FinancialItem } from '../domain/financial-item';
import { hasImportDuplicateSignal, type ImportCandidate, type ImportDecision, type ImportTransactionKind } from '../domain/import';
import type { ImportCandidateInsight } from '../application/import-service';
import { IMPORT_WARNING_CODES } from '../shared/import-warning-codes';

export interface ImportCandidateDraft {
  readonly kind: ImportTransactionKind | '';
  readonly amount: string;
  readonly date: string;
  readonly name: string;
  readonly creditCardAccountId: string;
  readonly categoryId: string;
  readonly decision: ImportDecision | '';
  readonly existingTransactionId: string;
}

export const IMPORT_WARNING_LABELS: Readonly<Record<string, string>> = {
  [IMPORT_WARNING_CODES.zeroAmountNotImportable]:
    '這筆金額為零，請選擇排除或修正金額。',
  [IMPORT_WARNING_CODES.negativeItemRequiresUserConfirmation]:
    '無法判斷這筆扣抵或退款，請指定交易類型。',
  [IMPORT_WARNING_CODES.splitDescriptionFragmentCountUnsupported]:
    '摘要跨行，請確認內容是否完整。',
};

export function draftFromCandidate(
  candidate: ImportCandidate,
  insight?: ImportCandidateInsight,
): ImportCandidateDraft {
  return {
    kind: candidate.kind ?? '',
    amount: String(candidate.amount),
    date: candidate.occurredAt.slice(0, 10),
    name: candidate.name,
    creditCardAccountId: candidate.creditCardAccountId,
    categoryId: candidate.categoryId ?? 'expense-uncategorized',
    decision:
      insight && hasImportDuplicateSignal(
        insight.duplicateObservationCount,
        insight.matches.length,
      )
        ? ''
        : 'create_new',
    existingTransactionId: '',
  };
}

export function importCandidateNeedsDecision(
  insight?: ImportCandidateInsight,
): boolean {
  return insight
    ? hasImportDuplicateSignal(
      insight.duplicateObservationCount,
      insight.matches.length,
    )
    : false;
}

export function importCandidateReviewState(
  observation: Pick<ImportCandidate, 'kind' | 'amount'> | undefined,
  warningCodes: readonly string[] | undefined,
  draft: Pick<ImportCandidateDraft, 'kind' | 'amount'>,
): 'none' | 'needs_review' | 'reviewed' {
  if (!warningCodes?.length && observation?.kind) return 'none';
  const amount = persistedImportAmount(draft.amount);
  const resolved = warningCodes?.every((code) => {
    if (code === IMPORT_WARNING_CODES.negativeItemRequiresUserConfirmation) {
      return draft.kind !== '';
    }
    if (code === IMPORT_WARNING_CODES.zeroAmountNotImportable) {
      return draft.kind !== '' && amount > 0;
    }
    return false;
  }) ?? draft.kind !== '';
  return resolved ? 'reviewed' : 'needs_review';
}

export function importAmountInputPatch(
  value: string,
): Pick<ImportCandidateDraft, 'amount'> &
  Partial<Pick<ImportCandidateDraft, 'kind'>> {
  const filtered = value.replace(/[^\d-]/g, '');
  const amount = `${filtered.startsWith('-') ? '-' : ''}${filtered.replace(/-/g, '')}`;
  return amount.startsWith('-')
    ? { amount, kind: 'credit_card_refund' }
    : { amount };
}

export function persistedImportAmount(value: string): number {
  return Math.abs(Number(value));
}

export function dateOnlyToTaipeiNoon(date: string): string {
  return `${date}T04:00:00.000Z`;
}

export function activeCreditCards(items: readonly FinancialItem[]) {
  return items.filter((item) => item.isActive && item.type === 'credit_card');
}

export function formatTwd(amount: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW').format(amount)}`;
}
