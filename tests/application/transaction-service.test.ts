import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionService } from '../../src/application/transaction-service';
import type { FinancialItemRepository } from '../../src/application/ports/financial-item-repository';
import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import type { TransactionDraft } from '../../src/shared/transactions';
import {
  InMemoryFinanceStore,
  categoryRepository,
  financialItemRepository,
  transactionRepository,
} from './in-memory-finance-store';

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
    overpaymentBalance: createTwdAmount(0),
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
  let store: InMemoryFinanceStore;
  let items: FinancialItemRepository;
  let service: TransactionService;

  beforeEach(() => {
    store = new InMemoryFinanceStore();
    items = financialItemRepository(store);
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
    store.categories.set('income-salary', {
      id: 'income-salary',
      kind: 'income',
      name: '薪資',
      isBuiltIn: true,
      isActive: true,
    });
    store.categories.set('expense-communication', {
      id: 'expense-communication',
      kind: 'expense',
      name: '通訊',
      isBuiltIn: true,
      isActive: true,
    });
    store.categories.set('expense-other', {
      id: 'expense-other',
      kind: 'expense',
      name: '其他',
      isBuiltIn: true,
      isActive: true,
    });
    service = new TransactionService(
      transactionRepository(store),
      categoryRepository(store),
      items,
      () => 'transaction-1',
      { now: () => NOW },
    );
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
      totalRefund: 0,
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

  it('calculates the monthly summary from all items, not only the visible page', () => {
    for (let index = 0; index < 51; index += 1) {
      store.transactions.set(`expense-${index}`, {
        id: `expense-${index}`,
        kind: 'expense',
        amount: createTwdAmount(1),
        occurredAt: `2026-07-28T07:${String(index).padStart(2, '0')}:00.000Z`,
        categoryId: 'expense-communication',
        name: '通訊',
        note: '',
        createdAt: NOW,
        updatedAt: NOW,
      });
    }

    const snapshot = service.listMonth(2026, 7);

    expect(snapshot.items).toHaveLength(50);
    expect(snapshot.totalCount).toBe(51);
    expect(snapshot.summary).toEqual({
      totalIncome: 0,
      totalExpense: 51,
      totalRefund: 0,
      balance: -51,
    });
  });

  it('passes the canonical Asia/Taipei month to persistence on create and update', () => {
    const repository = transactionRepository(store);
    const persistedMonths: string[] = [];
    service = new TransactionService(
      {
        ...repository,
        create: (transaction, financialMonth) => {
          persistedMonths.push(financialMonth);
          repository.create(transaction);
        },
        update: (transaction, financialMonth) => {
          persistedMonths.push(financialMonth);
          repository.update(transaction);
        },
      },
      categoryRepository(store),
      items,
      () => 'transaction-1',
      { now: () => '2026-09-02T00:00:00.000Z' },
    );

    service.create(
      expenseDraft({
        occurredAt: '2026-07-31T16:30:00.000Z',
      }),
      2026,
      8,
    );
    service.update(
      'transaction-1',
      expenseDraft({
        occurredAt: '2026-08-31T16:30:00.000Z',
      }),
      2026,
      9,
    );

    expect(persistedMonths).toEqual(['2026-08', '2026-09']);
  });

  it('US-04 records a transfer fee as an ordinary expense', () => {
    const snapshot = service.create(
      expenseDraft({
        amount: 15,
        categoryId: 'expense-other',
        name: '轉帳手續費',
      }),
      2026,
      7,
    );

    expect(snapshot.items[0]).toMatchObject({
      kind: 'expense',
      name: '轉帳手續費',
      amount: 15,
    });
    expect(snapshot.summary.totalExpense).toBe(15);
    expect(items.findById('bank-1')?.amount).toBe(99_985);
  });

  it('US-01, US-03 and US-05 apply income, transfer and credit card effects', () => {
    let sequence = 0;
    service = new TransactionService(
      transactionRepository(store),
      categoryRepository(store),
      items,
      () => `transaction-${++sequence}`,
      { now: () => NOW },
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
      totalRefund: 0,
      balance: 49_000,
    });
    expect(items.findById('bank-1')?.amount).toBe(144_000);
    expect(items.findById('cash-1')?.amount).toBe(7_000);
    expect(items.findById('card-1')?.amount).toBe(0);
  });

  it('applies refunds, overpayment consumption and excess payments end to end', () => {
    let sequence = 0;
    service = new TransactionService(
      transactionRepository(store),
      categoryRepository(store),
      items,
      () => `card-transaction-${++sequence}`,
      { now: () => NOW },
    );

    service.create(
      expenseDraft({
        kind: 'credit_card_purchase',
        amount: 300,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
      2026,
      7,
    );
    service.create(
      expenseDraft({
        kind: 'credit_card_refund',
        amount: 500,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
        originalTransactionId: 'card-transaction-1',
      }),
      2026,
      7,
    );
    service.create(
      expenseDraft({
        kind: 'credit_card_purchase',
        amount: 50,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
      2026,
      7,
    );
    const snapshot = service.create(
      expenseDraft({
        kind: 'credit_card_payment',
        amount: 100,
        destinationAccountId: 'card-1',
        categoryId: undefined,
      }),
      2026,
      7,
    );

    expect(items.findById('card-1')).toMatchObject({
      amount: 0,
      overpaymentBalance: 250,
    });
    expect(items.findById('bank-1')?.amount).toBe(99_900);
    expect(snapshot.summary).toEqual({
      totalIncome: 0,
      totalExpense: 350,
      totalRefund: 500,
      balance: 150,
    });
  });

  it('keeps a refund and clears its link when the original purchase is deleted', () => {
    let sequence = 0;
    service = new TransactionService(
      transactionRepository(store),
      categoryRepository(store),
      items,
      () => `linked-transaction-${++sequence}`,
      { now: () => NOW },
    );
    service.create(
      expenseDraft({
        kind: 'credit_card_purchase',
        amount: 300,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
      }),
      2026,
      7,
    );
    service.create(
      expenseDraft({
        kind: 'credit_card_refund',
        amount: 500,
        sourceAccountId: undefined,
        destinationAccountId: 'card-1',
        originalTransactionId: 'linked-transaction-1',
      }),
      2026,
      7,
    );

    service.delete('linked-transaction-1', 2026, 7);

    expect(store.transactions.get('linked-transaction-2')).toMatchObject({
      kind: 'credit_card_refund',
      originalTransactionId: undefined,
    });
    expect(items.findById('card-1')).toMatchObject({
      amount: 0,
      overpaymentBalance: 500,
    });
  });

  it('US-06 updates and deletes a transaction while restoring balances', () => {
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

  it('deletes an existing transaction after its account and category become inactive', () => {
    service.create(expenseDraft(), 2026, 7);
    const bank = store.items.get('bank-1');
    const category = store.categories.get('expense-communication');
    store.items.set('bank-1', { ...bank!, isActive: false });
    store.categories.set('expense-communication', {
      ...category!,
      isActive: false,
    });

    service.delete('transaction-1', 2026, 7);

    expect(store.items.get('bank-1')?.amount).toBe(100_000);
    expect(store.transactions.size).toBe(0);
  });

  it('rolls back balance changes when transaction persistence fails', () => {
    const repository = transactionRepository(store);
    service = new TransactionService(
      {
        ...repository,
        create: () => {
          throw new Error('simulated persistence failure');
        },
      },
      categoryRepository(store),
      items,
      () => 'transaction-1',
      { now: () => NOW },
    );

    expect(() => service.create(expenseDraft(), 2026, 7)).toThrow(
      'simulated persistence failure',
    );
    expect(store.items.get('bank-1')?.amount).toBe(100_000);
    expect(store.transactions.size).toBe(0);
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
