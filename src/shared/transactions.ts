import type {
  FinancialTransaction,
  MonthlyTransactionSummary,
  TransactionKind,
} from '../domain/transaction';

export interface TransactionDraft {
  readonly kind: TransactionKind;
  readonly amount: number;
  readonly occurredAt: string;
  readonly sourceAccountId?: string;
  readonly destinationAccountId?: string;
  readonly categoryId?: string;
  readonly originalTransactionId?: string;
  readonly name: string;
  readonly note: string;
}

export interface TransactionMonthSnapshot {
  readonly year: number;
  readonly month: number;
  readonly items: readonly FinancialTransaction[];
  readonly totalCount: number;
  readonly summary: MonthlyTransactionSummary;
}

export interface TransactionsApi {
  listMonth(
    year: number,
    month: number,
    offset?: number,
  ): Promise<TransactionMonthSnapshot>;
  create(
    draft: TransactionDraft,
    year: number,
    month: number,
  ): Promise<TransactionMonthSnapshot>;
  update(
    id: string,
    draft: TransactionDraft,
    year: number,
    month: number,
  ): Promise<TransactionMonthSnapshot>;
  delete(
    id: string,
    year: number,
    month: number,
  ): Promise<TransactionMonthSnapshot>;
}
