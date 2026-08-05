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
    { value: 'credit_card', label: '信用卡' },
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
  credit_card_refund: '信用卡退款',
};

export const MANAGEMENT_TABS = [
  ['asset_type', '資產類型'],
  ['liability_type', '負債類型'],
  ['income', '收入分類'],
  ['expense', '支出分類'],
] as const;

export const IMPORT_LABELS = {
  pageEyebrow: '交易自動化',
  pageTitle: '帳單匯入與待確認',
  sourceEyebrow: '本機帳單',
  sourceTitle: '匯入信用卡月結帳單',
  supportedSource: '目前支援：永豐信用卡文字型 PDF',
  supportedSourceName: '永豐信用卡月結帳單',
  noCreditCard: '請先新增要對應的信用卡。',
  chooseCreditCard: '請選擇信用卡',
  pdfPassword: 'PDF 密碼',
  pdfPasswordPlaceholder: '只用於這次開啟帳單',
  selectPdf: '選擇 PDF',
  noFileSelected: '尚未選擇檔案',
  parse: '開始解析',
  parsing: '解析中…',
  privacyNotice:
    'PDF 密碼不會保存、記錄或顯示在解析結果中；原始 PDF 也不會複製保存。',
  quickCard: '新增信用卡',
  quickCardHelp: '先建立信用卡名稱，即可選取帳單並開始匯入。',
  quickCardName: '信用卡名稱',
  quickCardNamePlaceholder: '例如：日常消費卡',
  createAndSelect: '建立並選取',
  creating: '建立中…',
  historyEyebrow: '已解析帳單',
  historyTitle: '匯入紀錄',
  historyLoading: '正在載入匯入紀錄…',
  historyEmpty: '目前沒有匯入紀錄。',
  historyLoadFailed: '無法載入匯入紀錄。',
  historyOpenFailed: '無法開啟這筆匯入紀錄。',
  historyRetry: '重新載入',
  historyOpen: '查看內容',
  historyOpening: '載入中…',
  removeHistory: '移除紀錄',
  removeHistoryEyebrow: '確認移除',
  removeHistoryTitle: '移除這筆匯入紀錄？',
  confirmRemoveHistory: '移除紀錄',
  removingHistory: '移除中…',
  cancel: '取消',
  batchTitle: '待確認項目',
  batchEmpty: '這份帳單目前沒有可處理的候選項目。',
  existingTransaction: '既有交易',
  chooseExistingTransaction: '請選擇既有交易',
  noExistingTransaction: '目前沒有可連結的既有交易。',
  linkNotice: '連結只建立來源關聯，不會修改既有交易。',
  compareAndLink: '比較並連結',
  applySuggestion: '採用建議',
  confirmCandidate: '確認此筆',
  resolved: '已處理',
  duplicateTitle: '可能已經記錄過',
  duplicateHelp:
    '找到相同來源觀察或欄位相符的既有交易。請自行確認，不會自動合併或刪除。',
  transactionKind: '交易語意',
  choose: '請選擇',
  summaryField: '摘要',
  expenseCategory: '支出分類',
  decisionQuestion: '這筆資料要怎麼處理？',
  createNew: '建立新交易',
  linkExisting: '連結既有交易',
  exclude: '排除',
  unknownCategory: '未知分類',
  unspecified: '未指定',
  statementValue: '帳單',
  existingValue: '既有',
  source: '來源',
  statementMonth: '帳單月份',
  pending: '待確認',
  excludedOrReview: '已排除／需檢查',
  reconciliation: '帳單總額核對',
  statementTotal: '銀行合計',
  reviewedTotal: '目前明細加總',
  reconciliationDifference: '差額',
  matched: '一致',
  mismatched: '不一致',
  date: '日期',
  amount: '金額',
  summary: '摘要',
  category: '分類',
  creditCard: '信用卡',
  unknownTime: '時間未知',
  missingSummary: '未填寫摘要',
  fallbackCategory: '暫未分類',
  fallbackCreditCard: '信用卡',
  duplicateDecisionRequired: '需選擇處理方式',
  contentReviewRequired: '需檢查內容',
  contentReviewed: '已檢查',
  contentReviewedHelp: '已指定交易語意，這筆內容已完成檢查。',
  fallbackReviewWarning: '這筆資料需要人工檢查。',
  expandCandidate: '查看與修改',
  collapseCandidate: '收合',
  batchHelp:
    '沒有重複疑慮的項目會依預設建立新交易；需要時再展開修改。',
  confirmEligible: '確認可直接處理的項目',
  amountField: '金額（TWD，退款可輸入負號）',
  negativeAmountHelp:
    '輸入負號會自動改為信用卡退款；正式資料仍以正數金額保存。',
} as const;

export function importHistoryMonth(statementMonth: string): string {
  return `${statementMonth.replace('-', ' 年 ')} 月`;
}

export function importHistoryStatus(
  pendingCount: number,
  candidateCount: number,
): string {
  return pendingCount > 0
    ? `待確認 ${pendingCount} 筆`
    : `已處理 ${candidateCount} 筆`;
}

export function importCategorySuggestion(
  evidenceCount: number,
  categoryName: string,
): string {
  return `依 ${evidenceCount} 筆已確認交易，建議分類：${categoryName}`;
}
