import { describe, expect, it } from 'vitest';

import type { ImportCandidate } from '../../src/domain/import';
import {
  matchingTransactionIds,
  suggestImportCategory,
} from '../../src/domain/import-suggestions';
import { createTwdAmount } from '../../src/domain/money';
import type { FinancialTransaction } from '../../src/domain/transaction';

const candidate: ImportCandidate = {
  id: 'candidate-1', batchId: 'batch-1', observationId: 'observation-1',
  kind: 'credit_card_purchase', amount: 100,
  occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date',
  name: '虛構 商店', creditCardAccountId: 'card-1',
  updatedAt: '2026-08-04T08:00:00.000Z',
};

function transaction(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: 'transaction-1', kind: 'credit_card_purchase',
    amount: createTwdAmount(100),
    occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date',
    destinationAccountId: 'card-1', categoryId: 'expense-food',
    name: '虛構 商店', note: '', createdAt: '2026-07-10T05:00:00.000Z',
    updatedAt: '2026-07-10T05:00:00.000Z', ...overrides,
  };
}

describe('import suggestions', () => {
  it('suggests a possible match only when the identifying fields agree', () => {
    expect(matchingTransactionIds(candidate, [
      transaction(),
      transaction({ id: 'same-amount-other-name', name: '另一筆交易' }),
      transaction({ id: 'same-name-other-date', occurredAt: '2026-07-11T04:00:00.000Z' }),
    ])).toEqual(['transaction-1']);
  });

  it('supports a cross-month refund category suggestion without changing its month', () => {
    const refund = { ...candidate, kind: 'credit_card_refund' as const,
      occurredAt: '2026-08-02T04:00:00.000Z', name: '虛構退款商店' };
    expect(suggestImportCategory(refund, [transaction({
      id: 'old-refund', kind: 'credit_card_refund',
      occurredAt: '2026-06-01T04:00:00.000Z', name: '虛構退款商店',
      categoryId: 'expense-shopping',
    })])).toEqual({ categoryId: 'expense-shopping', evidenceCount: 1 });
  });

  it('does not guess when matching history uses multiple categories', () => {
    expect(suggestImportCategory(candidate, [
      transaction(),
      transaction({ id: 'transaction-2', categoryId: 'expense-other' }),
    ])).toBeUndefined();
  });

  it('does not overwrite a category already chosen by the user', () => {
    expect(suggestImportCategory(
      { ...candidate, categoryId: 'expense-other' },
      [transaction()],
    )).toBeUndefined();
  });
});
