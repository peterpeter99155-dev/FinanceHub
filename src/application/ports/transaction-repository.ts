import type {
  FinancialTransaction,
  MonthlyTransactionSummary,
} from '../../domain/transaction';

export interface TransactionPage {
  readonly items: readonly FinancialTransaction[];
  readonly totalCount: number;
}

export interface TransactionRepository {
  runInTransaction<T>(operation: () => T): T;
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
  countByCategoryId(id: string): number;
  countByAccountId(id: string): number;
  reassignCategory(id: string, replacementId: string): void;
  create(transaction: FinancialTransaction): void;
  update(transaction: FinancialTransaction): void;
  delete(id: string): void;
}
