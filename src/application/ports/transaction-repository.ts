import type { FinancialTransaction } from '../../domain/transaction';

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
  listAllByMonth(
    year: number,
    month: number,
  ): readonly FinancialTransaction[];
  countByCategoryId(id: string): number;
  countByAccountId(id: string): number;
  reassignCategory(id: string, replacementId: string): void;
  create(
    transaction: FinancialTransaction,
    financialMonth: string,
  ): void;
  update(
    transaction: FinancialTransaction,
    financialMonth: string,
  ): void;
  delete(id: string): void;
}
