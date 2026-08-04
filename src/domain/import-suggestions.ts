import type { ImportCandidate } from './import';
import type { FinancialTransaction } from './transaction';

export interface ExistingTransactionMatch {
  readonly transactionId: string;
  readonly reason: 'same_source_observation' | 'matching_transaction_fields';
}

export interface CategorySuggestion {
  readonly categoryId: string;
  readonly evidenceCount: number;
}

export function matchingTransactionIds(
  candidate: ImportCandidate,
  transactions: readonly FinancialTransaction[],
): readonly string[] {
  if (!candidate.kind) return [];
  const normalizedName = normalizeImportSummary(candidate.name);
  return transactions
    .filter(
      (transaction) =>
        transaction.kind === candidate.kind &&
        transaction.amount === candidate.amount &&
        transaction.occurredAt.slice(0, 10) ===
          candidate.occurredAt.slice(0, 10) &&
        transaction.destinationAccountId ===
          candidate.creditCardAccountId &&
        normalizeImportSummary(transaction.name) === normalizedName,
    )
    .map(({ id }) => id);
}

export function suggestImportCategory(
  candidate: ImportCandidate,
  transactions: readonly FinancialTransaction[],
): CategorySuggestion | undefined {
  if (!candidate.kind || candidate.categoryId) return undefined;
  const normalizedName = normalizeImportSummary(candidate.name);
  if (!normalizedName) return undefined;
  const evidence = transactions.filter(
    (transaction) =>
      transaction.kind === candidate.kind &&
      transaction.categoryId !== undefined &&
      normalizeImportSummary(transaction.name) === normalizedName,
  );
  const categories = new Set(evidence.map(({ categoryId }) => categoryId));
  if (categories.size !== 1) return undefined;
  return {
    categoryId: [...categories][0]!,
    evidenceCount: evidence.length,
  };
}

export function normalizeImportSummary(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-TW');
}
