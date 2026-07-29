import type { FinancialItem } from '../../domain/financial-item';

export interface FinancialItemRepository {
  list(): readonly FinancialItem[];
  findById(id: string): FinancialItem | undefined;
  countByCustomTypeId(id: string): number;
  create(item: FinancialItem): void;
  update(item: FinancialItem): void;
  delete(id: string): void;
}
