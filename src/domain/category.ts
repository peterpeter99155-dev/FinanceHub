export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const MAX_CATEGORY_NAME_LENGTH = 20;

export interface FinancialCategory {
  readonly id: string;
  readonly kind: CategoryKind;
  readonly name: string;
  readonly isBuiltIn: boolean;
  readonly isActive: boolean;
}

export type CategoryRemovalPolicy =
  | { readonly action: 'delete' }
  | {
      readonly action: 'reassign_required';
      readonly usageCount: number;
    };

export function validateFinancialCategory(
  category: FinancialCategory,
): void {
  if (category.id.trim().length === 0) {
    throw new Error('Category id is required.');
  }

  const name = category.name.trim();

  if (name.length === 0) {
    throw new Error('Category name is required.');
  }

  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new Error(
      `Category name cannot exceed ${MAX_CATEGORY_NAME_LENGTH} characters.`,
    );
  }
}

export function getCategoryRemovalPolicy(
  usageCount: number,
): CategoryRemovalPolicy {
  if (!Number.isSafeInteger(usageCount) || usageCount < 0) {
    throw new Error('Category usage count is invalid.');
  }

  return usageCount === 0
    ? { action: 'delete' }
    : { action: 'reassign_required', usageCount };
}

export function assertUniqueActiveCategoryName(
  categories: readonly FinancialCategory[],
  candidate: Pick<FinancialCategory, 'id' | 'kind' | 'name' | 'isActive'>,
): void {
  if (!candidate.isActive) {
    return;
  }

  const normalizedName = normalizeCategoryName(candidate.name);
  const hasDuplicate = categories.some(
    (category) =>
      category.id !== candidate.id &&
      category.isActive &&
      category.kind === candidate.kind &&
      normalizeCategoryName(category.name) === normalizedName,
  );

  if (hasDuplicate) {
    throw new FinanceHubError(
      ERROR_CODES.duplicateName,
      'An active category with the same name and kind already exists.',
    );
  }
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase('zh-TW');
}
import {
  ERROR_CODES,
  FinanceHubError,
} from '../shared/errors';
