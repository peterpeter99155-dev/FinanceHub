import type {
  CategoryKind,
  FinancialCategory,
} from '../domain/category';
import type { FinancialItemCustomType } from '../domain/financial-item-custom-type';
import type { FinancialItemDirection } from '../domain/financial-item';

export interface CategoryDraft {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CategoriesApi {
  list(): Promise<readonly FinancialCategory[]>;
  create(draft: CategoryDraft): Promise<readonly FinancialCategory[]>;
  update(
    id: string,
    draft: CategoryDraft,
  ): Promise<readonly FinancialCategory[]>;
  delete(id: string): Promise<readonly FinancialCategory[]>;
  reassignAndDelete(
    id: string,
    replacementId: string,
  ): Promise<readonly FinancialCategory[]>;
}

export interface FinancialItemCustomTypeDraft {
  readonly direction: FinancialItemDirection;
  readonly name: string;
  readonly isActive: boolean;
}

export interface FinancialItemCustomTypesApi {
  list(): Promise<readonly FinancialItemCustomType[]>;
  create(
    draft: FinancialItemCustomTypeDraft,
  ): Promise<readonly FinancialItemCustomType[]>;
  update(
    id: string,
    draft: FinancialItemCustomTypeDraft,
  ): Promise<readonly FinancialItemCustomType[]>;
  delete(id: string): Promise<readonly FinancialItemCustomType[]>;
}
