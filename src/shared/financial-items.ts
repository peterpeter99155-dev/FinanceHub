import type {
  DataStatus,
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
} from '../domain/financial-item';

export interface FinancialItemDraft {
  readonly name: string;
  readonly direction: FinancialItemDirection;
  readonly type: FinancialItemType;
  readonly amount: number;
  readonly status: DataStatus;
  readonly includeInNetWorth: boolean;
}

export interface FinancialItemSnapshot {
  readonly items: readonly FinancialItem[];
  readonly summary: {
    readonly totalAssets: number;
    readonly totalLiabilities: number;
    readonly netWorth: number;
  };
}

export interface FinancialItemsApi {
  list(): Promise<FinancialItemSnapshot>;
  create(draft: FinancialItemDraft): Promise<FinancialItemSnapshot>;
  update(
    id: string,
    draft: FinancialItemDraft,
  ): Promise<FinancialItemSnapshot>;
  deactivate(id: string): Promise<FinancialItemSnapshot>;
}
