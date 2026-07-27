import type { FinancialItemType } from '../domain/financial-item';

export const FINANCIAL_ITEM_TYPE_LABELS: Readonly<
  Record<FinancialItemType, string>
> = {
  bank_deposit: '銀行存款',
  cash: '現金',
  property: '房產',
  custom_asset: '自訂資產',
  credit_card: '信用卡負債',
  mortgage: '房貸',
  loan: '其他貸款',
  custom_liability: '自訂負債',
};
