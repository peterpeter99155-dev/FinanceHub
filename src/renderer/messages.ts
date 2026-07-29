import { MAX_FINANCIAL_ITEM_AMOUNT_TWD } from '../domain/financial-item';
import {
  ERROR_CODES,
  errorCodeOf,
} from '../shared/errors';

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

function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
