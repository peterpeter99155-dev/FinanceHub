import type { FinancialItemCustomType } from '../../domain/financial-item-custom-type';

export interface FinancialItemCustomTypeRepository {
  list(): readonly FinancialItemCustomType[];
  findById(id: string): FinancialItemCustomType | undefined;
  create(type: FinancialItemCustomType): void;
  update(type: FinancialItemCustomType): void;
  delete(id: string): void;
}
