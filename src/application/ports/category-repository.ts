import type { FinancialCategory } from '../../domain/category';

export interface CategoryRepository {
  list(): readonly FinancialCategory[];
  findById(id: string): FinancialCategory | undefined;
  create(category: FinancialCategory): void;
  update(category: FinancialCategory): void;
  delete(id: string): void;
}
