import { describe, expect, it } from 'vitest';

import type { FinancialCategory } from '../../src/domain/category';
import { createTwdAmount } from '../../src/domain/money';
import {
  FinancialTransaction,
  TransactionAccount,
  applyBalanceEffect,
  calculateAccountBalanceEffects,
  calculateMonthlyTransactionSummary,
  calculateTransactionBalance,
  computeAccountBalanceEffects,
  hasInsufficientAccountBalance,
  validateFinancialTransaction,
} from '../../src/domain/transaction';

const NOW = '2026-07-28T08:00:00.000Z';

const ACCOUNTS: readonly TransactionAccount[] = [
  {
    id: 'bank-1',
    kind: 'bank',
    balance: createTwdAmount(100_000),
    isActive: true,
  },
  {
    id: 'cash-1',
    kind: 'cash',
    balance: createTwdAmount(2_000),
    isActive: true,
  },
  {
    id: 'card-1',
    kind: 'credit_card',
    balance: createTwdAmount(0),
    isActive: true,
  },
];

const CATEGORIES: readonly FinancialCategory[] = [
  {
    id: 'salary',
    kind: 'income',
    name: '薪資',
    isBuiltIn: true,
    isActive: true,
  },
  {
    id: 'communication',
    kind: 'expense',
    name: '通訊',
    isBuiltIn: true,
    isActive: true,
  },
];

function transaction(
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction {
  return {
    id: 'transaction-1',
    kind: 'expense',
    amount: createTwdAmount(599),
    occurredAt: '2026-07-28T07:30:00.000Z',
    sourceAccountId: 'bank-1',
    categoryId: 'communication',
    name: '',
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const OPTIONS = {
  now: NOW,
  accounts: ACCOUNTS,
  categories: CATEGORIES,
};

describe('financial transaction', () => {
  it('calculates a financial balance without counting transfers or card payments', () => {
    expect(
      calculateTransactionBalance([
        transaction({
          kind: 'income',
          amount: createTwdAmount(1_000),
        }),
        transaction({ amount: createTwdAmount(300) }),
        transaction({
          kind: 'transfer',
          amount: createTwdAmount(500),
        }),
      ]),
    ).toBe(700);
  });

  it.each([
    ['empty list', [], 0],
    ['income', [{ kind: 'income', amount: createTwdAmount(100) }], 100],
    ['expense', [{ kind: 'expense', amount: createTwdAmount(100) }], -100],
    ['transfer', [{ kind: 'transfer', amount: createTwdAmount(100) }], 0],
    [
      'credit card purchase',
      [{ kind: 'credit_card_purchase', amount: createTwdAmount(100) }],
      -100,
    ],
    [
      'credit card payment',
      [{ kind: 'credit_card_payment', amount: createTwdAmount(100) }],
      0,
    ],
  ] as const)(
    'classifies %s consistently for transaction balances',
    (_label, overrides, expected) => {
      expect(
        calculateTransactionBalance(
          overrides.map((override, index) =>
            transaction({ id: `case-${index}`, ...override }),
          ),
        ),
      ).toBe(expected);
    },
  );

  it('determines whether an expense would exceed an account balance', () => {
    expect(
      hasInsufficientAccountBalance('expense', 100_001, ACCOUNTS[0]),
    ).toBe(true);
    expect(
      hasInsufficientAccountBalance('expense', 100_000, ACCOUNTS[0]),
    ).toBe(false);
    expect(
      hasInsufficientAccountBalance('income', 100_001, ACCOUNTS[0]),
    ).toBe(false);
  });

  it('computes effects for an existing transaction without revalidation', () => {
    expect(computeAccountBalanceEffects(transaction())).toEqual([
      {
        accountId: 'bank-1',
        operation: 'decrease',
        amount: 599,
      },
    ]);
  });

  it('increases an asset account for income', () => {
    const input = transaction({
      kind: 'income',
      amount: createTwdAmount(50_000),
      sourceAccountId: undefined,
      destinationAccountId: 'bank-1',
      categoryId: 'salary',
    });

    expect(calculateAccountBalanceEffects(input, OPTIONS)).toEqual([
      {
        accountId: 'bank-1',
        operation: 'increase',
        amount: 50_000,
      },
    ]);
  });

  it('decreases an asset account for an expense', () => {
    expect(
      calculateAccountBalanceEffects(transaction(), OPTIONS),
    ).toEqual([
      {
        accountId: 'bank-1',
        operation: 'decrease',
        amount: 599,
      },
    ]);
  });

  it('allows income and expenses without changing an account balance', () => {
    expect(
      calculateAccountBalanceEffects(
        transaction({ sourceAccountId: undefined }),
        OPTIONS,
      ),
    ).toEqual([]);
    expect(
      calculateAccountBalanceEffects(
        transaction({
          kind: 'income',
          sourceAccountId: undefined,
          destinationAccountId: undefined,
          categoryId: 'salary',
        }),
        OPTIONS,
      ),
    ).toEqual([]);
  });

  it('moves value between asset accounts without changing wealth', () => {
    const input = transaction({
      kind: 'transfer',
      amount: createTwdAmount(5_000),
      sourceAccountId: 'bank-1',
      destinationAccountId: 'cash-1',
      categoryId: undefined,
    });

    expect(calculateAccountBalanceEffects(input, OPTIONS)).toEqual([
      {
        accountId: 'bank-1',
        operation: 'decrease',
        amount: 5_000,
      },
      {
        accountId: 'cash-1',
        operation: 'increase',
        amount: 5_000,
      },
    ]);
  });

  it('increases credit card liability when a purchase is made', () => {
    const input = transaction({
      kind: 'credit_card_purchase',
      sourceAccountId: undefined,
      destinationAccountId: 'card-1',
    });

    expect(calculateAccountBalanceEffects(input, OPTIONS)).toEqual([
      {
        accountId: 'card-1',
        operation: 'increase',
        amount: 599,
      },
    ]);
  });

  it('decreases bank assets and card liability for a card payment', () => {
    const input = transaction({
      kind: 'credit_card_payment',
      amount: createTwdAmount(1_000),
      sourceAccountId: 'bank-1',
      destinationAccountId: 'card-1',
      categoryId: undefined,
    });

    expect(calculateAccountBalanceEffects(input, OPTIONS)).toEqual([
      {
        accountId: 'bank-1',
        operation: 'decrease',
        amount: 1_000,
      },
      {
        accountId: 'card-1',
        operation: 'decrease',
        amount: 1_000,
      },
    ]);
  });

  it('rejects future transactions', () => {
    expect(() =>
      validateFinancialTransaction(
        transaction({ occurredAt: '2026-07-28T08:00:01.000Z' }),
        OPTIONS,
      ),
    ).toThrow('future');
  });

  it.each([0, -1, 1.5, Number.NaN, 1_000_000_000_000])(
    'rejects invalid transaction amount %s at runtime',
    (amount) => {
      expect(() =>
        validateFinancialTransaction(
          transaction({
            amount: amount as FinancialTransaction['amount'],
          }),
          OPTIONS,
        ),
      ).toThrow('supported range');
    },
  );

  it('rejects invalid account and category combinations', () => {
    expect(() =>
      validateFinancialTransaction(
        transaction({ sourceAccountId: 'card-1' }),
        OPTIONS,
      ),
    ).toThrow('active asset account');

    expect(() =>
      validateFinancialTransaction(
        transaction({ categoryId: 'salary' }),
        OPTIONS,
      ),
    ).toThrow('expense category');
  });

  it('rejects transfers to the same account', () => {
    expect(() =>
      validateFinancialTransaction(
        transaction({
          kind: 'transfer',
          sourceAccountId: 'bank-1',
          destinationAccountId: 'bank-1',
          categoryId: undefined,
        }),
        OPTIONS,
      ),
    ).toThrow('must be different');
  });

  it('applies increases and decreases without allowing negative balances', () => {
    expect(
      applyBalanceEffect(createTwdAmount(1_000), {
        accountId: 'bank-1',
        operation: 'increase',
        amount: createTwdAmount(500),
      }),
    ).toBe(1_500);

    expect(() =>
      applyBalanceEffect(createTwdAmount(100), {
        accountId: 'bank-1',
        operation: 'decrease',
        amount: createTwdAmount(101),
      }),
    ).toThrow('negative');
  });

  it('calculates monthly income, expense and balance without transfers or card payments', () => {
    const result = calculateMonthlyTransactionSummary(
      [
        transaction({
          id: 'income',
          kind: 'income',
          amount: createTwdAmount(50_000),
          sourceAccountId: undefined,
          destinationAccountId: 'bank-1',
          categoryId: 'salary',
        }),
        transaction(),
        transaction({
          id: 'card-purchase',
          kind: 'credit_card_purchase',
          amount: createTwdAmount(1_000),
          sourceAccountId: undefined,
          destinationAccountId: 'card-1',
        }),
        transaction({
          id: 'transfer',
          kind: 'transfer',
          amount: createTwdAmount(5_000),
          destinationAccountId: 'cash-1',
          categoryId: undefined,
        }),
        transaction({
          id: 'card-payment',
          kind: 'credit_card_payment',
          amount: createTwdAmount(1_000),
          destinationAccountId: 'card-1',
          categoryId: undefined,
        }),
        transaction({
          id: 'previous-month',
          occurredAt: '2026-06-30T12:00:00.000Z',
          amount: createTwdAmount(9_999),
        }),
      ],
      2026,
      7,
    );

    expect(result).toEqual({
      totalIncome: 50_000,
      totalExpense: 1_599,
      balance: 48_401,
    });
  });
});
