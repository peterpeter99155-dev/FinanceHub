import type {
  FinancialTransaction,
  MonthlyTransactionSummary,
} from '../../domain/transaction';

export interface TransactionPage {
  readonly items: readonly FinancialTransaction[];
  readonly totalCount: number;
}

export interface TransactionRepository {
  findById(id: string): FinancialTransaction | undefined;
  listByMonth(
    year: number,
    month: number,
    offset?: number,
    limit?: number,
  ): TransactionPage;
  summarizeMonth(
    year: number,
    month: number,
  ): MonthlyTransactionSummary;
  create(transaction: FinancialTransaction): void;
  update(transaction: FinancialTransaction): void;
  delete(id: string, updatedAt: string): void;
}
