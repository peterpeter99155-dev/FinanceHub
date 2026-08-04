import type { TwdAmount } from './money';
import type {
  TransactionAccount,
  TransactionAccountKind,
} from './transaction';

export const MAX_FINANCIAL_ITEM_AMOUNT_TWD = 999_999_999_999;

export const FINANCIAL_ITEM_DIRECTIONS = ['asset', 'liability'] as const;
export type FinancialItemDirection =
  (typeof FINANCIAL_ITEM_DIRECTIONS)[number];

export const FINANCIAL_ITEM_TYPES = [
  'bank_deposit',
  'cash',
  'property',
  'custom_asset',
  'credit_card',
  'mortgage',
  'loan',
  'custom_liability',
] as const;
export type FinancialItemType = (typeof FINANCIAL_ITEM_TYPES)[number];

export const DATA_STATUSES = [
  'confirmed',
  'automatic',
  'estimated',
  'stale',
  'pending_confirmation',
] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export interface FinancialItem {
  readonly id: string;
  readonly name: string;
  readonly direction: FinancialItemDirection;
  readonly type: FinancialItemType;
  readonly customTypeId?: string;
  readonly amount: TwdAmount;
  readonly overpaymentBalance: TwdAmount;
  readonly status: DataStatus;
  readonly updatedAt: string;
  readonly isActive: boolean;
  readonly includeInNetWorth: boolean;
}

const ASSET_TYPES: ReadonlySet<FinancialItemType> = new Set([
  'bank_deposit',
  'cash',
  'property',
  'custom_asset',
]);

export function validateFinancialItem(item: FinancialItem): void {
  if (item.id.trim().length === 0) {
    throw new Error('Financial item id is required.');
  }

  if (item.name.trim().length === 0) {
    throw new Error('Financial item name is required.');
  }

  if (Number.isNaN(Date.parse(item.updatedAt))) {
    throw new Error('Financial item updatedAt must be an ISO date-time.');
  }

  if (item.amount > MAX_FINANCIAL_ITEM_AMOUNT_TWD) {
    throw new Error(
      'Financial item amount exceeds the supported maximum.',
    );
  }

  if (item.overpaymentBalance > MAX_FINANCIAL_ITEM_AMOUNT_TWD) {
    throw new Error(
      'Financial item overpayment balance exceeds the supported maximum.',
    );
  }

  if (item.type !== 'credit_card' && item.overpaymentBalance !== 0) {
    throw new Error('Only credit cards can have an overpayment balance.');
  }

  if (
    item.type === 'credit_card' &&
    item.amount > 0 &&
    item.overpaymentBalance > 0
  ) {
    throw new Error(
      'A credit card cannot have amount due and overpayment at the same time.',
    );
  }

  if (
    item.customTypeId !== undefined &&
    item.type !== 'custom_asset' &&
    item.type !== 'custom_liability'
  ) {
    throw new Error(
      'Only custom financial item types can have a custom type id.',
    );
  }

  const expectedDirection = ASSET_TYPES.has(item.type)
    ? 'asset'
    : 'liability';

  if (item.direction !== expectedDirection) {
    throw new Error(
      `Financial item type "${item.type}" must have direction "${expectedDirection}".`,
    );
  }
}

export function isIncludedInOfficialNetWorth(
  item: FinancialItem,
): boolean {
  return (
    item.isActive &&
    item.includeInNetWorth &&
    item.status !== 'pending_confirmation'
  );
}

export function toTransactionAccount(
  item: FinancialItem,
): TransactionAccount | undefined {
  const kind = transactionAccountKind(item.type);

  return kind
    ? {
        id: item.id,
        kind,
        balance: item.amount,
        overpaymentBalance: item.overpaymentBalance,
        isActive: item.isActive,
      }
    : undefined;
}

function transactionAccountKind(
  type: FinancialItemType,
): TransactionAccountKind | undefined {
  switch (type) {
    case 'bank_deposit':
      return 'bank';
    case 'cash':
      return 'cash';
    case 'credit_card':
      return 'credit_card';
    default:
      return undefined;
  }
}
