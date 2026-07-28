import type { FinancialCategory } from './category';
import { financialMonthFromDateTime } from './financial-time';
import type { TwdAmount } from './money';
import { createTwdAmount } from './money';

export const MAX_TRANSACTION_AMOUNT_TWD = 999_999_999_999;
export const MAX_TRANSACTION_NAME_LENGTH = 50;
export const MAX_TRANSACTION_NOTE_LENGTH = 200;

export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'transfer',
  'credit_card_purchase',
  'credit_card_payment',
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_ACCOUNT_KINDS = [
  'cash',
  'bank',
  'electronic_wallet',
  'credit_card',
] as const;
export type TransactionAccountKind =
  (typeof TRANSACTION_ACCOUNT_KINDS)[number];

export interface TransactionAccount {
  readonly id: string;
  readonly kind: TransactionAccountKind;
  readonly balance: TwdAmount;
  readonly isActive: boolean;
}

export interface FinancialTransaction {
  readonly id: string;
  readonly kind: TransactionKind;
  readonly amount: TwdAmount;
  readonly occurredAt: string;
  readonly sourceAccountId?: string;
  readonly destinationAccountId?: string;
  readonly categoryId?: string;
  readonly name: string;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccountBalanceEffect {
  readonly accountId: string;
  readonly operation: 'increase' | 'decrease';
  readonly amount: TwdAmount;
}

export interface MonthlyTransactionSummary {
  readonly totalIncome: TwdAmount;
  readonly totalExpense: TwdAmount;
  readonly balance: number;
}

export interface ValidateTransactionOptions {
  readonly now: string;
  readonly accounts: readonly TransactionAccount[];
  readonly categories: readonly FinancialCategory[];
}

export function validateFinancialTransaction(
  transaction: FinancialTransaction,
  options: ValidateTransactionOptions,
): void {
  validateCommonFields(transaction, options.now);

  const source = findAccount(
    transaction.sourceAccountId,
    options.accounts,
  );
  const destination = findAccount(
    transaction.destinationAccountId,
    options.accounts,
  );
  const category = findCategory(
    transaction.categoryId,
    options.categories,
  );

  switch (transaction.kind) {
    case 'income':
      assertNoAccount(source, 'Income cannot have a source account.');
      if (destination) {
        assertAssetAccount(destination, 'Income destination');
      }
      assertCategory(category, 'income');
      break;
    case 'expense':
      if (source) {
        assertAssetAccount(source, 'Expense source');
      }
      assertNoAccount(
        destination,
        'Expense cannot have a destination account.',
      );
      assertCategory(category, 'expense');
      break;
    case 'transfer':
      assertAssetAccount(source, 'Transfer source');
      assertAssetAccount(destination, 'Transfer destination');
      assertDifferentAccounts(source, destination);
      assertNoCategory(category, 'Transfer cannot have a category.');
      break;
    case 'credit_card_purchase':
      assertNoAccount(
        source,
        'Credit card purchase cannot have a source account.',
      );
      assertCreditCard(destination, 'Credit card purchase destination');
      assertCategory(category, 'expense');
      break;
    case 'credit_card_payment':
      assertAssetAccount(source, 'Credit card payment source');
      assertCreditCard(destination, 'Credit card payment destination');
      assertDifferentAccounts(source, destination);
      assertNoCategory(
        category,
        'Credit card payment cannot have a category.',
      );
      break;
  }
}

export function calculateAccountBalanceEffects(
  transaction: FinancialTransaction,
  options: ValidateTransactionOptions,
): readonly AccountBalanceEffect[] {
  validateFinancialTransaction(transaction, options);
  return computeAccountBalanceEffects(transaction);
}

export function createTransactionValidationOptions(
  now: string,
  accounts: readonly TransactionAccount[],
  categories: readonly FinancialCategory[],
): ValidateTransactionOptions {
  return { now, accounts, categories };
}

export function computeAccountBalanceEffects(
  transaction: FinancialTransaction,
): readonly AccountBalanceEffect[] {
  switch (transaction.kind) {
    case 'income':
      return transaction.destinationAccountId
        ? [
            increase(
              transaction.destinationAccountId,
              transaction.amount,
            ),
          ]
        : [];
    case 'expense':
      return transaction.sourceAccountId
        ? [decrease(transaction.sourceAccountId, transaction.amount)]
        : [];
    case 'transfer':
      return [
        decrease(transaction.sourceAccountId, transaction.amount),
        increase(transaction.destinationAccountId, transaction.amount),
      ];
    case 'credit_card_purchase':
      return [
        increase(transaction.destinationAccountId, transaction.amount),
      ];
    case 'credit_card_payment':
      return [
        decrease(transaction.sourceAccountId, transaction.amount),
        decrease(transaction.destinationAccountId, transaction.amount),
      ];
  }
}

export function applyBalanceEffect(
  currentBalance: TwdAmount,
  effect: AccountBalanceEffect,
): TwdAmount {
  const nextBalance =
    effect.operation === 'increase'
      ? currentBalance + effect.amount
      : currentBalance - effect.amount;

  if (!Number.isSafeInteger(nextBalance)) {
    throw new Error('Account balance exceeds the supported range.');
  }

  if (nextBalance < 0) {
    throw new Error('Account balance cannot become negative.');
  }

  return createTwdAmount(nextBalance);
}

export function reverseBalanceEffect(
  effect: AccountBalanceEffect,
): AccountBalanceEffect {
  return {
    ...effect,
    operation:
      effect.operation === 'increase' ? 'decrease' : 'increase',
  };
}

export function calculateMonthlyTransactionSummary(
  transactions: readonly FinancialTransaction[],
  year: number,
  month: number,
): MonthlyTransactionSummary {
  if (!Number.isSafeInteger(year) || year < 1) {
    throw new Error('Summary year is invalid.');
  }

  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new Error('Summary month is invalid.');
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const expectedMonth = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}`;

  for (const transaction of transactions) {
    if (
      financialMonthFromDateTime(transaction.occurredAt) !==
      expectedMonth
    ) {
      continue;
    }

    if (transaction.kind === 'income') {
      totalIncome = addSafeAmount(totalIncome, transaction.amount);
    } else if (
      transaction.kind === 'expense' ||
      transaction.kind === 'credit_card_purchase'
    ) {
      totalExpense = addSafeAmount(totalExpense, transaction.amount);
    }
  }

  const balance = totalIncome - totalExpense;

  if (!Number.isSafeInteger(balance)) {
    throw new Error('Monthly balance exceeds the supported range.');
  }

  return {
    totalIncome: createTwdAmount(totalIncome),
    totalExpense: createTwdAmount(totalExpense),
    balance,
  };
}

function validateCommonFields(
  transaction: FinancialTransaction,
  now: string,
): void {
  if (transaction.id.trim().length === 0) {
    throw new Error('Transaction id is required.');
  }

  if (
    !Number.isSafeInteger(transaction.amount) ||
    transaction.amount <= 0 ||
    transaction.amount > MAX_TRANSACTION_AMOUNT_TWD
  ) {
    throw new Error('Transaction amount is outside the supported range.');
  }

  if (transaction.name.trim().length > MAX_TRANSACTION_NAME_LENGTH) {
    throw new Error(
      `Transaction name cannot exceed ${MAX_TRANSACTION_NAME_LENGTH} characters.`,
    );
  }

  if (transaction.note.trim().length > MAX_TRANSACTION_NOTE_LENGTH) {
    throw new Error(
      `Transaction note cannot exceed ${MAX_TRANSACTION_NOTE_LENGTH} characters.`,
    );
  }

  const occurredAt = parseDateTime(transaction.occurredAt, 'occurredAt');
  const currentTime = parseDateTime(now, 'now');
  parseDateTime(transaction.createdAt, 'createdAt');
  parseDateTime(transaction.updatedAt, 'updatedAt');

  if (occurredAt.getTime() > currentTime.getTime()) {
    throw new Error('Transaction occurredAt cannot be in the future.');
  }
}

function findAccount(
  id: string | undefined,
  accounts: readonly TransactionAccount[],
): TransactionAccount | undefined {
  if (id === undefined) {
    return undefined;
  }

  const account = accounts.find((candidate) => candidate.id === id);

  if (!account) {
    throw new Error(`Transaction account "${id}" was not found.`);
  }

  if (!account.isActive) {
    throw new Error(`Transaction account "${id}" is inactive.`);
  }

  return account;
}

function findCategory(
  id: string | undefined,
  categories: readonly FinancialCategory[],
): FinancialCategory | undefined {
  if (id === undefined) {
    return undefined;
  }

  const category = categories.find((candidate) => candidate.id === id);

  if (!category) {
    throw new Error(`Transaction category "${id}" was not found.`);
  }

  if (!category.isActive) {
    throw new Error(`Transaction category "${id}" is inactive.`);
  }

  return category;
}

function assertAssetAccount(
  account: TransactionAccount | undefined,
  field: string,
): asserts account is TransactionAccount {
  if (!account || account.kind === 'credit_card') {
    throw new Error(`${field} must be an active asset account.`);
  }
}

function assertCreditCard(
  account: TransactionAccount | undefined,
  field: string,
): asserts account is TransactionAccount {
  if (!account || account.kind !== 'credit_card') {
    throw new Error(`${field} must be an active credit card account.`);
  }
}

function assertNoAccount(
  account: TransactionAccount | undefined,
  message: string,
): void {
  if (account) {
    throw new Error(message);
  }
}

function assertCategory(
  category: FinancialCategory | undefined,
  kind: FinancialCategory['kind'],
): asserts category is FinancialCategory {
  if (!category || category.kind !== kind) {
    throw new Error(`Transaction requires an active ${kind} category.`);
  }
}

function assertNoCategory(
  category: FinancialCategory | undefined,
  message: string,
): void {
  if (category) {
    throw new Error(message);
  }
}

function assertDifferentAccounts(
  source: TransactionAccount,
  destination: TransactionAccount,
): void {
  if (source.id === destination.id) {
    throw new Error(
      'Transaction source and destination accounts must be different.',
    );
  }
}

function increase(
  accountId: string | undefined,
  amount: TwdAmount,
): AccountBalanceEffect {
  return {
    accountId: requireAccountId(accountId),
    operation: 'increase',
    amount,
  };
}

function decrease(
  accountId: string | undefined,
  amount: TwdAmount,
): AccountBalanceEffect {
  return {
    accountId: requireAccountId(accountId),
    operation: 'decrease',
    amount,
  };
}

function requireAccountId(id: string | undefined): string {
  if (id === undefined) {
    throw new Error('Validated transaction is missing an account id.');
  }

  return id;
}

function parseDateTime(value: string, field: string): Date {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`Transaction ${field} must be an ISO date-time.`);
  }

  return new Date(timestamp);
}

function addSafeAmount(left: number, right: TwdAmount): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new Error('Transaction total exceeds the supported range.');
  }

  return result;
}
