import type { FinancialCategory } from '../../domain/category';

export interface CategoryRepository {
  list(): readonly FinancialCategory[];
  findById(id: string): FinancialCategory | undefined;
  countTransactions(id: string): number;
  create(category: FinancialCategory): void;
  update(category: FinancialCategory): void;
  reassignAndDelete(id: string, replacementId: string): void;
  delete(id: string): void;
}
