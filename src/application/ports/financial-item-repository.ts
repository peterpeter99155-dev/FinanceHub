import type { FinancialItem } from '../../domain/financial-item';

export interface FinancialItemRepository {
  list(): readonly FinancialItem[];
  findById(id: string): FinancialItem | undefined;
  create(item: FinancialItem): void;
  update(item: FinancialItem): void;
  deactivate(id: string, updatedAt: string): void;
}
