import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import type { FinancialTransaction } from '../../src/domain/transaction';
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

  it('creates an expense and updates its account atomically', () => {
    transactions.create(transaction());

    expect(transactions.findById('expense-1')).toEqual(transaction());
    expect(items.findById('bank-1')?.amount).toBe(99_401);
    expect(transactions.summarizeMonth(2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 599,
      balance: -599,
    });
  });

  it('creates income and transfers without counting transfers as income or expense', () => {
    transactions.create(
      transaction({
        id: 'income-1',
        kind: 'income',
        amount: createTwdAmount(50_000),
        sourceAccountId: undefined,
        destinationAccountId: 'bank-1',
        categoryId: 'income-salary',
      }),
    );
    transactions.create(
      transaction({
        id: 'transfer-1',
        kind: 'transfer',
        amount: createTwdAmount(5_000),
        destinationAccountId: 'cash-1',
        categoryId: undefined,
      }),
    );

    expect(items.findById('bank-1')?.amount).toBe(145_000);
    expect(items.findById('cash-1')?.amount).toBe(7_000);
    expect(transactions.summarizeMonth(2026, 7)).toEqual({
      totalIncome: 50_000,
      totalExpense: 0,
      balance: 50_000,
    });
  });

  it('records card purchases and payments without double-counting expense', () => {
    transactions.create(
      transaction({
        id: 'card-purchase-1',
        kind: 'credit_card_purchase',
        amount: createTwdAmount(1_000),
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
    );
    transactions.create(
      transaction({
        id: 'card-payment-1',
        kind: 'credit_card_payment',
        amount: createTwdAmount(1_000),
        destinationAccountId: 'card-1',
        categoryId: undefined,
      }),
    );

    expect(items.findById('bank-1')?.amount).toBe(99_000);
    expect(items.findById('card-1')?.amount).toBe(0);
    expect(transactions.summarizeMonth(2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 1_000,
      balance: -1_000,
    });
  });

  it('reverses old effects when updating or deleting a transaction', () => {
    transactions.create(transaction());
    const updated = transaction({
      amount: createTwdAmount(699),
      updatedAt: '2026-07-28T08:30:00.000Z',
    });

    transactions.update(updated);
    expect(items.findById('bank-1')?.amount).toBe(99_301);
    expect(transactions.summarizeMonth(2026, 7).totalExpense).toBe(699);

    transactions.delete(
      'expense-1',
      '2026-07-28T09:00:00.000Z',
    );
    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.findById('expense-1')).toBeUndefined();
  });

  it('rolls back all changes when a transaction cannot be completed', () => {
    expect(() =>
      transactions.create(
        transaction({ amount: createTwdAmount(100_001) }),
      ),
    ).toThrow('negative');

    expect(items.findById('bank-1')?.amount).toBe(100_000);
    expect(transactions.findById('expense-1')).toBeUndefined();
  });

  it('lists one month in pages and preserves all historical months', () => {
    transactions.create(transaction());
    transactions.create(
      transaction({
        id: 'expense-2',
        occurredAt: '2026-07-27T07:30:00.000Z',
      }),
    );
    transactions.create(
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
    expect(transactions.summarizeMonth(2026, 7)).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
    });
  });
});
