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
  if (code === ERROR_CODES.importDuplicateSource) {
    return '這份來源檔案已經匯入過。';
  }
  if (code === ERROR_CODES.importReconciliationMismatch) {
    return '帳單明細加總與銀行合計不一致，請先檢查內容。';
  }
  if (code === ERROR_CODES.importCandidateUnavailable) {
    return '這筆待確認資料已處理或不存在。';
  }
  return '交易儲存失敗，請確認輸入內容。';
}

export function importErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.importDuplicateSource) return '這份帳單已經匯入過。';
  if (code === ERROR_CODES.importReconciliationMismatch) return '帳單明細加總與銀行合計不一致，無法確認。';
  if (code === ERROR_CODES.importCandidateUnavailable) return '待確認項目已處理、資料不完整或不存在。';
  if (code === ERROR_CODES.importBatchInUse) return '這筆匯入紀錄已建立或連結正式交易，不能直接移除。';
  if (code === ERROR_CODES.importSelectionUnavailable) return '選取的帳單已失效，請重新選擇 PDF。';
  if (code === ERROR_CODES.pdfPasswordRequired) return '這份 PDF 需要密碼，請輸入後再解析。';
  if (code === ERROR_CODES.pdfPasswordIncorrect) return 'PDF 密碼不正確，請重新輸入。';
  if (code === ERROR_CODES.pdfFileTooLarge) return 'PDF 檔案超過可解析的大小上限。';
  if (code === ERROR_CODES.pdfPageLimitExceeded) return 'PDF 頁數超過可解析的上限。';
  if (code === ERROR_CODES.pdfTextItemLimitExceeded) return 'PDF 文字內容超過可解析的上限。';
  if (code === ERROR_CODES.pdfParseTimeout) return 'PDF 解析時間過長，已安全停止。';
  if (code === ERROR_CODES.pdfInvalid) return 'PDF 已損壞或不是有效的 PDF 檔案。';
  if (code === ERROR_CODES.pdfNoExtractableText) return '這份 PDF 沒有可抽取文字；目前不支援掃描型帳單。';
  if (code === ERROR_CODES.pdfUnsupportedFormat) return '目前無法辨識這份信用卡帳單的版面。';
  if (code === ERROR_CODES.pdfParseIncomplete) return '帳單有部分內容無法完整辨識，未建立任何待確認資料。';
  if (code === ERROR_CODES.pdfParseFailed) return 'PDF 解析失敗，未保存帳單內容或密碼。';
  if (code === ERROR_CODES.invalidAccount) return '請選擇有效的信用卡。';
  if (code === ERROR_CODES.invalidCategory) return '請選擇有效的支出分類。';
  if (code === ERROR_CODES.amountOutOfRange) return '金額不在可接受範圍內。';
  if (code === ERROR_CODES.futureTransaction) return '交易日期不能晚於今天。';
  return '帳單匯入未完成，請檢查檔案、PDF 密碼與待確認內容。';
}

export function importPartialConfirmationMessage(
  confirmedCount: number,
  skippedCount: number,
): string {
  return `已處理 ${confirmedCount} 筆；另有 ${skippedCount} 筆疑似重複仍待選擇。`;
}

export function importReconciliationBlockedMessage(
  difference: number,
  singleCandidate: boolean,
): string {
  const formatted = new Intl.NumberFormat('zh-TW').format(difference);
  return singleCandidate
    ? `這筆內容已完成檢查，但整份帳單仍差 TWD ${formatted}，暫時不能建立交易。`
    : `整份帳單仍差 TWD ${formatted}，請先檢查明細後再確認。`;
}

export const IMPORT_MESSAGES = {
  parsed:
    '帳單解析完成；一般項目可直接確認，需要時再展開修改。',
  alreadyImported: '這份帳單先前已匯入，已顯示既有內容。',
  duplicateDecisionRequired: '疑似重複的項目仍需選擇處理方式。',
  candidateConfirmed: '這筆資料已確認。',
  batchConfirmed: '這批資料已完成處理。',
  creditCardNameRequired: '請輸入信用卡名稱。',
  removeHistoryDescription:
    '移除後可重新匯入同一份 PDF；電腦上的原始 PDF 不會被刪除。',
  historyRemoved: '匯入紀錄已移除，可以重新選擇同一份 PDF。',
} as const;

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
