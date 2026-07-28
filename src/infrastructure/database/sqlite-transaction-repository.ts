import type { DatabaseSync } from 'node:sqlite';

import type {
  TransactionPage,
  TransactionRepository,
} from '../../application/ports/transaction-repository';
import type { FinancialCategory } from '../../domain/category';
import {
  FinancialItem,
  FinancialItemType,
} from '../../domain/financial-item';
import { createTwdAmount } from '../../domain/money';
import {
  TRANSACTION_KINDS,
  AccountBalanceEffect,
  FinancialTransaction,
  MonthlyTransactionSummary,
  TransactionAccount,
  TransactionAccountKind,
  TransactionKind,
  applyBalanceEffect,
  calculateAccountBalanceEffects,
  calculateMonthlyTransactionSummary,
} from '../../domain/transaction';
import { SqliteCategoryRepository } from './sqlite-category-repository';
import { SqliteFinancialItemRepository } from './sqlite-financial-item-repository';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

interface TransactionRow {
  id: string;
  kind: string;
  amount: number;
  occurred_at: string;
  source_account_id: string | null;
  destination_account_id: string | null;
  category_id: string | null;
  name: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export class SqliteTransactionRepository
  implements TransactionRepository
{
  private readonly financialItems: SqliteFinancialItemRepository;
  private readonly categories: SqliteCategoryRepository;

  constructor(private readonly database: DatabaseSync) {
    this.financialItems = new SqliteFinancialItemRepository(database);
    this.categories = new SqliteCategoryRepository(database);
  }

  findById(id: string): FinancialTransaction | undefined {
    const row = this.database
      .prepare(
        `${selectTransactionColumns()}
         FROM financial_transactions
         WHERE id = ?`,
      )
      .get(id) as unknown as TransactionRow | undefined;

    return row ? mapTransactionRow(row) : undefined;
  }

  listByMonth(
    year: number,
    month: number,
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
  ): TransactionPage {
    const financialMonth = formatFinancialMonth(year, month);
    validatePagination(offset, limit);

    const rows = this.database
      .prepare(
        `${selectTransactionColumns()}
         FROM financial_transactions
         WHERE financial_month = ?
         ORDER BY occurred_at DESC, id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(financialMonth, limit, offset) as unknown as TransactionRow[];
    const countRow = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM financial_transactions
         WHERE financial_month = ?`,
      )
      .get(financialMonth) as { count: number };

    return {
      items: rows.map(mapTransactionRow),
      totalCount: Number(countRow.count),
    };
  }

  summarizeMonth(
    year: number,
    month: number,
  ): MonthlyTransactionSummary {
    const financialMonth = formatFinancialMonth(year, month);
    const rows = this.database
      .prepare(
        `${selectTransactionColumns()}
         FROM financial_transactions
         WHERE financial_month = ?`,
      )
      .all(financialMonth) as unknown as TransactionRow[];

    return calculateMonthlyTransactionSummary(
      rows.map(mapTransactionRow),
      year,
      month,
    );
  }

  create(transaction: FinancialTransaction): void {
    this.inTransaction(() => {
      const options = this.validationOptions(transaction, false);
      const effects = calculateAccountBalanceEffects(
        transaction,
        options,
      );

      this.applyEffects(effects, transaction.updatedAt);
      this.insert(transaction);
    });
  }

  update(transaction: FinancialTransaction): void {
    this.inTransaction(() => {
      const existing = this.findById(transaction.id);

      if (!existing) {
        throw new Error(
          `Financial transaction "${transaction.id}" was not found.`,
        );
      }

      const oldEffects = calculateAccountBalanceEffects(
        existing,
        this.validationOptions(existing, true),
      );
      this.applyEffects(
        oldEffects.map(reverseEffect),
        transaction.updatedAt,
      );

      const newEffects = calculateAccountBalanceEffects(
        transaction,
        this.validationOptions(transaction, false),
      );
      this.applyEffects(newEffects, transaction.updatedAt);

      const result = this.database
        .prepare(
          `UPDATE financial_transactions
           SET kind = ?, amount = ?, occurred_at = ?,
               financial_month = ?, source_account_id = ?,
               destination_account_id = ?, category_id = ?, name = ?,
               note = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          transaction.kind,
          transaction.amount,
          transaction.occurredAt,
          financialMonthFromDate(transaction.occurredAt),
          transaction.sourceAccountId ?? null,
          transaction.destinationAccountId ?? null,
          transaction.categoryId ?? null,
          transaction.name.trim(),
          transaction.note.trim(),
          transaction.updatedAt,
          transaction.id,
        );

      if (Number(result.changes) !== 1) {
        throw new Error(
          `Financial transaction "${transaction.id}" was not found.`,
        );
      }
    });
  }

  delete(id: string, updatedAt: string): void {
    this.inTransaction(() => {
      const existing = this.findById(id);

      if (!existing) {
        throw new Error(`Financial transaction "${id}" was not found.`);
      }

      const effects = calculateAccountBalanceEffects(
        existing,
        this.validationOptions(existing, true),
      );
      this.applyEffects(effects.map(reverseEffect), updatedAt);

      const result = this.database
        .prepare('DELETE FROM financial_transactions WHERE id = ?')
        .run(id);

      if (Number(result.changes) !== 1) {
        throw new Error(`Financial transaction "${id}" was not found.`);
      }
    });
  }

  private insert(transaction: FinancialTransaction): void {
    this.database
      .prepare(
        `INSERT INTO financial_transactions (
          id, kind, amount, occurred_at, financial_month,
          source_account_id, destination_account_id, category_id,
          name, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        transaction.id,
        transaction.kind,
        transaction.amount,
        transaction.occurredAt,
        financialMonthFromDate(transaction.occurredAt),
        transaction.sourceAccountId ?? null,
        transaction.destinationAccountId ?? null,
        transaction.categoryId ?? null,
        transaction.name.trim(),
        transaction.note.trim(),
        transaction.createdAt,
        transaction.updatedAt,
      );
  }

  private validationOptions(
    transaction: FinancialTransaction,
    allowInactive: boolean,
  ): {
    now: string;
    accounts: readonly TransactionAccount[];
    categories: readonly FinancialCategory[];
  } {
    const accountIds = [
      transaction.sourceAccountId,
      transaction.destinationAccountId,
    ].filter((id): id is string => id !== undefined);
    const accounts = accountIds.map((id) => {
      const item = this.financialItems.findById(id);

      if (!item) {
        throw new Error(`Transaction account "${id}" was not found.`);
      }

      return mapFinancialItemToAccount(item, allowInactive);
    });
    const categories = transaction.categoryId
      ? [this.requireCategory(transaction.categoryId, allowInactive)]
      : [];

    return {
      now: transaction.updatedAt,
      accounts,
      categories,
    };
  }

  private requireCategory(
    id: string,
    allowInactive: boolean,
  ): FinancialCategory {
    const category = this.categories.findById(id);

    if (!category) {
      throw new Error(`Transaction category "${id}" was not found.`);
    }

    return allowInactive
      ? { ...category, isActive: true }
      : category;
  }

  private applyEffects(
    effects: readonly AccountBalanceEffect[],
    updatedAt: string,
  ): void {
    for (const effect of effects) {
      const item = this.financialItems.findById(effect.accountId);

      if (!item) {
        throw new Error(
          `Transaction account "${effect.accountId}" was not found.`,
        );
      }

      this.financialItems.update({
        ...item,
        amount: applyBalanceEffect(item.amount, effect),
        updatedAt,
      });
    }
  }

  private inTransaction(operation: () => void): void {
    this.database.exec('BEGIN IMMEDIATE;');

    try {
      operation();
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }
}

function mapFinancialItemToAccount(
  item: FinancialItem,
  allowInactive: boolean,
): TransactionAccount {
  const kind = mapAccountKind(item.type);

  if (!kind) {
    throw new Error(
      `Financial item "${item.id}" cannot be used for transactions.`,
    );
  }

  return {
    id: item.id,
    kind,
    balance: item.amount,
    isActive: allowInactive ? true : item.isActive,
  };
}

function mapAccountKind(
  type: FinancialItemType,
): TransactionAccountKind | undefined {
  switch (type) {
    case 'bank_deposit':
      return 'bank';
    case 'cash':
      return 'cash';
    case 'credit_card':
      return 'credit_card';
    default:
      return undefined;
  }
}

function mapTransactionRow(row: TransactionRow): FinancialTransaction {
  const kind = assertMember(row.kind, TRANSACTION_KINDS, 'kind');

  return {
    id: row.id,
    kind: kind as TransactionKind,
    amount: createTwdAmount(row.amount),
    occurredAt: row.occurred_at,
    sourceAccountId: row.source_account_id ?? undefined,
    destinationAccountId: row.destination_account_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function selectTransactionColumns(): string {
  return `SELECT id, kind, amount, occurred_at, source_account_id,
                 destination_account_id, category_id, name, note,
                 created_at, updated_at`;
}

function financialMonthFromDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Transaction occurredAt must be an ISO date-time.');
  }

  return formatFinancialMonth(
    date.getFullYear(),
    date.getMonth() + 1,
  );
}

function formatFinancialMonth(year: number, month: number): string {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999) {
    throw new Error('Financial month year is invalid.');
  }

  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new Error('Financial month month is invalid.');
  }

  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}`;
}

function validatePagination(offset: number, limit: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Transaction page offset is invalid.');
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    throw new Error(
      `Transaction page limit must be between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }
}

function reverseEffect(
  effect: AccountBalanceEffect,
): AccountBalanceEffect {
  return {
    ...effect,
    operation:
      effect.operation === 'increase' ? 'decrease' : 'increase',
  };
}

function assertMember<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Stored financial transaction has invalid ${field}.`);
  }

  return value as T;
}
