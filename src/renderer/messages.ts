import { MAX_FINANCIAL_ITEM_AMOUNT_TWD } from '../domain/financial-item';
import {
  ERROR_CODES,
  errorCodeOf,
} from '../shared/errors';

export const SECURITY_MESSAGES = {
  newPasswordPlaceholder:
    '8 至 64 個半形英文、數字或特殊符號',
  newPasswordInvalid:
    '密碼需要 8 至 64 個半形英文、數字或特殊符號。',
  backupInstructions:
    '關閉 FinanceHub 後，將下列兩個檔案一起複製到安全的位置。缺少任何一個都無法還原。',
  irreversibleWarning:
    'FinanceHub 不會保存你的密碼，也沒有重設密碼或繞過密碼的功能。忘記密碼，或遺失上述任一檔案，資料都無法取回。',
} as const;

export function securityErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.wrongPassword) {
    return '主密碼不正確，請再試一次。';
  }
  if (code === ERROR_CODES.invalidPassword) {
    return '主密碼須為 8 至 1024 個字元。';
  }
  if (code === ERROR_CODES.databaseMetadataMissing) {
    return '找不到 metadata 檔案，為避免覆寫資料，FinanceHub 已停止開啟資料庫。請從完整備份還原資料庫與 metadata 檔案。';
  }
  if (code === ERROR_CODES.databaseFileMissing) {
    return '找不到資料庫檔案。請從包含資料庫與 metadata 的完整備份還原。';
  }
  if (code === ERROR_CODES.databaseSetupIncomplete) {
    return '偵測到未完成的資料庫設定，FinanceHub 不會自動覆寫檔案。';
  }
  if (code === ERROR_CODES.unsupportedEncryptionFormat) {
    return '這份資料使用較新的加密格式，請更新 FinanceHub。';
  }
  if (
    code === ERROR_CODES.invalidDatabaseMetadata ||
    code === ERROR_CODES.databaseUnreadable
  ) {
    return '加密資料檔案無法讀取，請使用完整備份還原。';
  }
  return '無法開啟加密資料，請關閉程式後再試。';
}

export function financialItemErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.amountMustBePositive) {
    return '金額必須大於 0。';
  }
  if (code === ERROR_CODES.amountOutOfRange) {
    return `單筆金額上限為 ${formatTwd(
      MAX_FINANCIAL_ITEM_AMOUNT_TWD,
    )}。`;
  }
  return '操作失敗，請確認輸入內容後再試。';
}

export function managementErrorMessage(
  error: unknown,
  subject: '類型' | '分類',
): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.duplicateName) {
    return '已有相同名稱，請使用其他名稱。';
  }
  if (code === ERROR_CODES.builtInImmutable) {
    return `系統預設${subject}不能修改或刪除。`;
  }
  if (code === ERROR_CODES.resourceInUse) {
    return subject === '類型'
      ? '這個類型已有資產或負債使用，不能停用或刪除。'
      : '這個分類已被交易使用，不能直接刪除。';
  }
  return financialItemErrorMessage(error);
}

export function transactionErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.futureTransaction) {
    return '交易時間不能晚於現在。';
  }
  if (code === ERROR_CODES.negativeAccountBalance) {
    return '帳戶餘額不足，無法完成這筆交易。';
  }
  if (code === ERROR_CODES.invalidCategory) {
    return '請選擇正確的收入或支出分類。';
  }
  if (code === ERROR_CODES.invalidAccount) {
    return '請選擇正確的收款、付款或信用卡帳戶。';
  }
  return '交易儲存失敗，請確認輸入內容。';
}

export function backupErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.backupInProgress) {
    return '已有備份正在進行。';
  }
  if (code === ERROR_CODES.backupCheckpointBusy) {
    return '資料庫目前忙碌，請稍後再試。';
  }
  if (code === ERROR_CODES.backupSourceInvalid) {
    return '備份所需的資料檔案不完整。';
  }
  if (code === ERROR_CODES.backupFormatInvalid) {
    return '備份格式或完整性驗證失敗。';
  }
  if (code === ERROR_CODES.backupWriteQueueFull) {
    return '等待中的資料操作過多，請稍後再試。';
  }
  if (code === ERROR_CODES.backupIoFailure) {
    return '無法存取備份資料夾，請稍後再試。';
  }
  if (code === ERROR_CODES.backupExportUnavailable) {
    return '目前沒有可匯出的有效備份，請先建立備份。';
  }
  if (code === ERROR_CODES.backupExportFailure) {
    return '無法匯出最新備份，請確認目的資料夾後再試。';
  }
  return '備份操作未完成，請稍後再試。';
}

function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
