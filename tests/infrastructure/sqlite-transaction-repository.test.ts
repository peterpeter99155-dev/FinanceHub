import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import type { FinancialTransaction } from '../../src/domain/transaction';
import { calculateMonthlyTransactionSummary } from '../../src/domain/transaction';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';
import { SqliteTransactionRepository } from '../../src/infrastructure/database/sqlite-transaction-repository';

const NOW = '2026-07-28T08:00:00.000Z';

function item(
  overrides: Partial<FinancialItem> = {},
): FinancialItem {
  return {
    id: 'bank-1',
    name: '示範銀行',
    direction: 'asset',
    type: 'bank_deposit',
    amount: createTwdAmount(100_000),
    overpaymentBalance: createTwdAmount(0),
    status: 'confirmed',
    updatedAt: NOW,
    isActive: true,
    includeInNetWorth: true,
    ...overrides,
  };
}

function transaction(
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction {
  return {
    id: 'expense-1',
    kind: 'expense',
    amount: createTwdAmount(599),
    occurredAt: '2026-07-28T07:30:00.000Z',
    sourceAccountId: 'bank-1',
    categoryId: 'expense-communication',
    name: '手機費',
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function persist(
  repository: SqliteTransactionRepository,
  value: FinancialTransaction,
): void {
  repository.create(value, value.occurredAt.slice(0, 7));
}

describe('SqliteTransactionRepository', () => {
  let connection: BootstrapDatabase;
  let items: SqliteFinancialItemRepository;
  let transactions: SqliteTransactionRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    items = new SqliteFinancialItemRepository(connection.database);
    transactions = new SqliteTransactionRepository(connection.database);
    items.create(item());
    items.create(
      item({
        id: 'cash-1',
        name: '現金',
        type: 'cash',
        amount: createTwdAmount(2_000),
      }),
    );
    items.create(
      item({
        id: 'card-1',
        name: '示範信用卡',
        direction: 'liability',
        type: 'credit_card',
        amount: createTwdAmount(0),
      }),
    );
  });

  afterEach(() => {
    connection.close();
  });

  it('persists an expense without owning account-balance rules', () => {
    persist(transactions, transaction());

    expect(transactions.findById('expense-1')).toEqual(transaction());
    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(summary(transactions, 2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 599,
      totalRefund: 0,
      balance: -599,
    });
  });

  it('creates income and transfers without counting transfers as income or expense', () => {
    persist(
      transactions,
      transaction({
        id: 'income-1',
        kind: 'income',
        amount: createTwdAmount(50_000),
        sourceAccountId: undefined,
        destinationAccountId: 'bank-1',
        categoryId: 'income-salary',
      }),
    );
    persist(
      transactions,
      transaction({
        id: 'transfer-1',
        kind: 'transfer',
        amount: createTwdAmount(5_000),
        destinationAccountId: 'cash-1',
        categoryId: undefined,
      }),
    );

    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(items.findById('cash-1')?.amount).toBe(2_000);
    expect(summary(transactions, 2026, 7)).toEqual({
      totalIncome: 50_000,
      totalExpense: 0,
      totalRefund: 0,
      balance: 50_000,
    });
  });

  it('records card purchases and payments without double-counting expense', () => {
    persist(
      transactions,
      transaction({
        id: 'card-purchase-1',
        kind: 'credit_card_purchase',
        amount: createTwdAmount(1_000),
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
    );
    persist(
      transactions,
      transaction({
        id: 'card-payment-1',
        kind: 'credit_card_payment',
        amount: createTwdAmount(1_000),
        destinationAccountId: 'card-1',
        categoryId: undefined,
      }),
    );

    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(items.findById('card-1')?.amount).toBe(0);
    expect(summary(transactions, 2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 1_000,
      totalRefund: 0,
      balance: -1_000,
    });
  });

  it('persists refunds and clears only the optional link when the purchase is deleted', () => {
    const purchase = transaction({
      id: 'purchase-1',
      kind: 'credit_card_purchase',
      sourceAccountId: undefined,
      destinationAccountId: 'card-1',
    });
    const refund = transaction({
      id: 'refund-1',
      kind: 'credit_card_refund',
      amount: createTwdAmount(200),
      sourceAccountId: undefined,
      destinationAccountId: 'card-1',
      originalTransactionId: 'purchase-1',
    });

    persist(transactions, purchase);
    persist(transactions, refund);
    expect(transactions.findById('refund-1')).toEqual(refund);
    expect(summary(transactions, 2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 599,
      totalRefund: 200,
      balance: -399,
    });

    transactions.delete('purchase-1');

    expect(transactions.findById('refund-1')).toEqual({
      ...refund,
      originalTransactionId: undefined,
    });
  });

  it('updates and deletes transaction records', () => {
    persist(transactions, transaction());
    const updated = transaction({
      amount: createTwdAmount(699),
      updatedAt: '2026-07-28T08:30:00.000Z',
    });

    transactions.update(updated, '2026-07');
    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(summary(transactions, 2026, 7).totalExpense).toBe(699);

    transactions.delete('expense-1');
    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.findById('expense-1')).toBeUndefined();
  });

  it('deletes an existing transaction after its account and category become inactive', () => {
    persist(transactions, transaction());
    connection.database.exec(
      `UPDATE financial_items SET is_active = 0 WHERE id = 'bank-1';
       UPDATE financial_categories
       SET is_active = 0
       WHERE id = 'expense-communication';`,
    );

    transactions.delete('expense-1');

    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.findById('expense-1')).toBeUndefined();
  });

  it('rolls back all adapter writes when a unit of work fails', () => {
    expect(() =>
      transactions.runInTransaction(() => {
        persist(transactions, transaction());
        items.update(
          item({ amount: createTwdAmount(99_401) }),
        );
        throw new Error('simulated failure');
      }),
    ).toThrow('simulated failure');

    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.findById('expense-1')).toBeUndefined();
  });

  it('lists one month in pages and preserves all historical months', () => {
    persist(transactions, transaction());
    persist(
      transactions,
      transaction({
        id: 'expense-2',
        occurredAt: '2026-07-27T07:30:00.000Z',
      }),
    );
    persist(
      transactions,
      transaction({
        id: 'june-expense',
        occurredAt: '2026-06-30T07:30:00.000Z',
      }),
    );

    const firstPage = transactions.listByMonth(2026, 7, 0, 1);
    const secondPage = transactions.listByMonth(2026, 7, 1, 1);

    expect(firstPage.totalCount).toBe(2);
    expect(firstPage.items.map(({ id }) => id)).toEqual(['expense-1']);
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      'expense-2',
    ]);
    expect(transactions.listByMonth(2026, 6).totalCount).toBe(1);
  });

  it('keeps Sprint 01 balances as opening balances without creating income', () => {
    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.listByMonth(2026, 7).totalCount).toBe(0);
    expect(summary(transactions, 2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      totalRefund: 0,
      balance: 0,
    });
  });
});

function summary(
  transactions: SqliteTransactionRepository,
  year: number,
  month: number,
) {
  return calculateMonthlyTransactionSummary(
    transactions.listAllByMonth(year, month),
    year,
    month,
  );
}
