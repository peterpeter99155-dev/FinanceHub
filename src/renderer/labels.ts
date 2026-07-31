import type {
  DataStatus,
  FinancialItemDirection,
  FinancialItemType,
} from '../domain/financial-item';
import type { TransactionKind } from '../domain/transaction';

export const SECURITY_LABELS = {
  setupEyebrow: '保護你的財務資料',
  setupTitle: '設定主密碼',
  unlockEyebrow: '本機資料已加密',
  unlockTitle: '解鎖 FinanceHub',
  password: '主密碼',
  confirmPassword: '再次輸入主密碼',
  acknowledgeRecoveryRisk:
    '我了解必須記住密碼，並一起備份兩個資料檔案',
  createAndContinue: '建立加密資料庫',
  unlockAndContinue: '解鎖',
} as const;

export const FINANCIAL_ITEM_TYPE_OPTIONS: Readonly<
  Record<
    FinancialItemDirection,
    readonly { value: FinancialItemType; label: string }[]
  >
> = {
  asset: [
    { value: 'bank_deposit', label: '銀行存款' },
    { value: 'cash', label: '現金' },
    { value: 'property', label: '房產' },
    { value: 'custom_asset', label: '自訂資產' },
  ],
  liability: [
    { value: 'mortgage', label: '房貸' },
    { value: 'loan', label: '其他貸款' },
    { value: 'custom_liability', label: '自訂負債' },
  ],
};

export const STATUS_LABELS: Readonly<Record<DataStatus, string>> = {
  confirmed: '我已確認金額正確',
  automatic: '由系統自動更新',
  estimated: '這是推算金額',
  stale: '資料可能已過期',
  pending_confirmation: '我之後再確認',
};

export const MANUAL_DATA_STATUSES = [
  'confirmed',
  'pending_confirmation',
] as const satisfies readonly DataStatus[];

export const TRANSACTION_KIND_LABELS: Readonly<
  Record<TransactionKind, string>
> = {
  income: '收入',
  expense: '支出',
  transfer: '帳戶轉帳',
  credit_card_purchase: '信用卡消費',
  credit_card_payment: '信用卡繳款',
};

export const MANAGEMENT_TABS = [
  ['asset_type', '資產類型'],
  ['liability_type', '負債類型'],
  ['income', '收入分類'],
  ['expense', '支出分類'],
] as const;
