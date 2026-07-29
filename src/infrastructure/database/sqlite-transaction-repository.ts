import type { SqliteDatabase } from './sqlite-database';

import type {
  TransactionPage,
  TransactionRepository,
} from '../../application/ports/transaction-repository';
import { financialMonthFromDateTime } from '../../domain/financial-time';
import { createTwdAmount } from '../../domain/money';
import {
  TRANSACTION_KINDS,
  FinancialTransaction,
  MonthlyTransactionSummary,
  TransactionKind,
  calculateMonthlyTransactionSummary,
} from '../../domain/transaction';

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
  constructor(private readonly database: SqliteDatabase) {}

  runInTransaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE;');

    try {
      const result = operation();
      this.database.exec('COMMIT;');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
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
    this.insert(transaction);
  }

  countByCategoryId(id: string): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM financial_transactions
         WHERE category_id = ?`,
      )
      .get(id) as { count: number };

    return Number(row.count);
  }

  countByAccountId(id: string): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM financial_transactions
         WHERE source_account_id = ? OR destination_account_id = ?`,
      )
      .get(id, id) as { count: number };

    return Number(row.count);
  }

  reassignCategory(id: string, replacementId: string): void {
    this.database
      .prepare(
        `UPDATE financial_transactions
         SET category_id = ?
         WHERE category_id = ?`,
      )
      .run(replacementId, id);
  }

  update(transaction: FinancialTransaction): void {
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
          financialMonthFromDateTime(transaction.occurredAt),
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
  }

  delete(id: string): void {
    const result = this.database
        .prepare('DELETE FROM financial_transactions WHERE id = ?')
        .run(id);

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial transaction "${id}" was not found.`);
    }
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
        financialMonthFromDateTime(transaction.occurredAt),
        transaction.sourceAccountId ?? null,
        transaction.destinationAccountId ?? null,
        transaction.categoryId ?? null,
        transaction.name.trim(),
        transaction.note.trim(),
        transaction.createdAt,
        transaction.updatedAt,
      );
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
