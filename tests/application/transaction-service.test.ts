import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TransactionService } from '../../src/application/transaction-service';
import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteCategoryRepository } from '../../src/infrastructure/database/sqlite-category-repository';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';
import { SqliteTransactionRepository } from '../../src/infrastructure/database/sqlite-transaction-repository';
import type { TransactionDraft } from '../../src/shared/transactions';

const NOW = '2026-07-28T08:00:00.000Z';

function account(
  overrides: Partial<FinancialItem> = {},
): FinancialItem {
  return {
    id: 'bank-1',
    name: '示範銀行',
    direction: 'asset',
    type: 'bank_deposit',
    amount: createTwdAmount(100_000),
    status: 'confirmed',
    updatedAt: NOW,
    isActive: true,
    includeInNetWorth: true,
    ...overrides,
  };
}

function expenseDraft(
  overrides: Partial<TransactionDraft> = {},
): TransactionDraft {
  return {
    kind: 'expense',
    amount: 599,
    occurredAt: '2026-07-28T07:30:00.000Z',
    sourceAccountId: 'bank-1',
    categoryId: 'expense-communication',
    name: '',
    note: '',
    ...overrides,
  };
}

describe('TransactionService', () => {
  let connection: BootstrapDatabase;
  let items: SqliteFinancialItemRepository;
  let service: TransactionService;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    items = new SqliteFinancialItemRepository(connection.database);
    items.create(account());
    items.create(
      account({
        id: 'cash-1',
        name: '現金',
        type: 'cash',
        amount: createTwdAmount(2_000),
      }),
    );
    items.create(
      account({
        id: 'card-1',
        name: '示範信用卡',
        direction: 'liability',
        type: 'credit_card',
        amount: createTwdAmount(0),
      }),
    );
    service = new TransactionService(
      new SqliteTransactionRepository(connection.database),
      new SqliteCategoryRepository(connection.database),
      () => 'transaction-1',
      () => NOW,
    );
  });

  afterEach(() => {
    connection.close();
  });

  it('creates an expense and uses its category as the default name', () => {
    const snapshot = service.create(expenseDraft(), 2026, 7);

    expect(snapshot.items[0]).toMatchObject({
      id: 'transaction-1',
      name: '通訊',
      amount: 599,
    });
    expect(snapshot.summary).toEqual({
      totalIncome: 0,
      totalExpense: 599,
      balance: -599,
    });
    expect(items.findById('bank-1')?.amount).toBe(99_401);
  });

  it('records an expense without changing balances when no account is selected', () => {
    const snapshot = service.create(
      expenseDraft({ sourceAccountId: undefined }),
      2026,
      7,
    );

    expect(snapshot.summary.totalExpense).toBe(599);
    expect(items.findById('bank-1')?.amount).toBe(100_000);
  });

  it('creates income, transfer, card purchase and card payment with correct totals', () => {
    let sequence = 0;
    service = new TransactionService(
      new SqliteTransactionRepository(connection.database),
      new SqliteCategoryRepository(connection.database),
      () => `transaction-${++sequence}`,
      () => NOW,
    );

    service.create(
      expenseDraft({
        kind: 'income',
        amount: 50_000,
        sourceAccountId: undefined,
        destinationAccountId: 'bank-1',
        categoryId: 'income-salary',
      }),
      2026,
      7,
    );
    service.create(
      expenseDraft({
        kind: 'transfer',
        amount: 5_000,
        destinationAccountId: 'cash-1',
        categoryId: undefined,
      }),
      2026,
      7,
    );
    service.create(
      expenseDraft({
        kind: 'credit_card_purchase',
        amount: 1_000,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
      2026,
      7,
    );
    const snapshot = service.create(
      expenseDraft({
        kind: 'credit_card_payment',
        amount: 1_000,
        destinationAccountId: 'card-1',
        categoryId: undefined,
      }),
      2026,
      7,
    );

    expect(snapshot.summary).toEqual({
      totalIncome: 50_000,
      totalExpense: 1_000,
      balance: 49_000,
    });
    expect(items.findById('bank-1')?.amount).toBe(144_000);
    expect(items.findById('cash-1')?.amount).toBe(7_000);
    expect(items.findById('card-1')?.amount).toBe(0);
  });

  it('updates and deletes a transaction while restoring balances', () => {
    service.create(expenseDraft(), 2026, 7);

    service.update(
      'transaction-1',
      expenseDraft({ amount: 699 }),
      2026,
      7,
    );
    expect(items.findById('bank-1')?.amount).toBe(99_301);

    const snapshot = service.delete('transaction-1', 2026, 7);
    expect(snapshot.items).toEqual([]);
    expect(items.findById('bank-1')?.amount).toBe(100_000);
  });

  it.each([
    [expenseDraft({ amount: 0 }), 'allowed range'],
    [
      expenseDraft({ occurredAt: '2026-07-28T08:00:01.000Z' }),
      'future',
    ],
    [expenseDraft({ sourceAccountId: 'missing' }), 'not found'],
  ])('rejects invalid renderer transaction input %#', (draft, message) => {
    expect(() => service.create(draft, 2026, 7)).toThrow(message);
    expect(items.findById('bank-1')?.amount).toBe(100_000);
  });
});
