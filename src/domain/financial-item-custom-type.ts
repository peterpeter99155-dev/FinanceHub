import type { FinancialItemDirection } from './financial-item';

export const MAX_FINANCIAL_ITEM_CUSTOM_TYPE_NAME_LENGTH = 20;

export interface FinancialItemCustomType {
  readonly id: string;
  readonly direction: FinancialItemDirection;
  readonly name: string;
  readonly isActive: boolean;
}

export function validateFinancialItemCustomType(
  type: FinancialItemCustomType,
): void {
  if (type.id.trim().length === 0) {
    throw new Error('Financial item custom type id is required.');
  }

  const name = type.name.trim();

  if (name.length === 0) {
    throw new Error('Financial item custom type name is required.');
  }

  if (name.length > MAX_FINANCIAL_ITEM_CUSTOM_TYPE_NAME_LENGTH) {
    throw new Error(
      `Financial item custom type name cannot exceed ${MAX_FINANCIAL_ITEM_CUSTOM_TYPE_NAME_LENGTH} characters.`,
    );
  }
}
