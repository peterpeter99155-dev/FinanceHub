import { describe, expect, it } from 'vitest';

import {
  FinancialCategory,
  assertUniqueActiveCategoryName,
  getCategoryRemovalPolicy,
  validateFinancialCategory,
} from '../../src/domain/category';

function category(
  overrides: Partial<FinancialCategory> = {},
): FinancialCategory {
  return {
    id: 'expense-food',
    kind: 'expense',
    name: '飲食',
    isBuiltIn: false,
    isActive: true,
    ...overrides,
  };
}

describe('financial category', () => {
  it('validates a category name', () => {
    expect(() => validateFinancialCategory(category())).not.toThrow();
    expect(() =>
      validateFinancialCategory(category({ name: ' '.repeat(3) })),
    ).toThrow('required');
    expect(() =>
      validateFinancialCategory(category({ name: '字'.repeat(21) })),
    ).toThrow('20 characters');
  });

  it('allows deletion only when the category is unused', () => {
    expect(getCategoryRemovalPolicy(0)).toEqual({ action: 'delete' });
    expect(getCategoryRemovalPolicy(12)).toEqual({
      action: 'reassign_required',
      usageCount: 12,
    });
  });

  it('prevents duplicate active names within the same kind', () => {
    const categories = [category()];

    expect(() =>
      assertUniqueActiveCategoryName(categories, {
        id: 'another-food',
        kind: 'expense',
        name: ' 飲食 ',
        isActive: true,
      }),
    ).toThrow('same name');

    expect(() =>
      assertUniqueActiveCategoryName(categories, {
        id: 'income-food',
        kind: 'income',
        name: '飲食',
        isActive: true,
      }),
    ).not.toThrow();
  });
});
