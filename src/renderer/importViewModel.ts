import type { FinancialItem } from '../domain/financial-item';
import type { ImportCandidate, ImportDecision, ImportTransactionKind } from '../domain/import';
import { IMPORT_WARNING_CODES } from '../shared/import-warning-codes';

export interface ImportCandidateDraft {
  readonly kind: ImportTransactionKind | '';
  readonly amount: string;
  readonly date: string;
  readonly name: string;
  readonly creditCardAccountId: string;
  readonly categoryId: string;
  readonly decision: ImportDecision;
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

export function draftFromCandidate(candidate: ImportCandidate): ImportCandidateDraft {
  return {
    kind: candidate.kind ?? '',
    amount: String(candidate.amount),
    date: candidate.occurredAt.slice(0, 10),
    name: candidate.name,
    creditCardAccountId: candidate.creditCardAccountId,
    categoryId: candidate.categoryId ?? 'expense-uncategorized',
    decision: 'create_new',
    existingTransactionId: '',
  };
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
