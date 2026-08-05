import { describe, expect, it } from 'vitest';

import { importErrorMessage } from '../../src/renderer/messages';
import { ERROR_CODES } from '../../src/shared/errors';

describe('importErrorMessage', () => {
  it.each([
    [ERROR_CODES.pdfPasswordRequired, '這份 PDF 需要密碼，請輸入後再解析。'],
    [ERROR_CODES.pdfPasswordIncorrect, 'PDF 密碼不正確，請重新輸入。'],
    [ERROR_CODES.pdfInvalid, 'PDF 已損壞或不是有效的 PDF 檔案。'],
    [ERROR_CODES.pdfNoExtractableText, '這份 PDF 沒有可抽取文字；目前不支援掃描型帳單。'],
    [ERROR_CODES.pdfUnsupportedFormat, '目前無法辨識這份信用卡帳單的版面。'],
    [ERROR_CODES.pdfParseIncomplete, '帳單有部分內容無法完整辨識，未建立任何待確認資料。'],
  ])('將 %s 顯示為可辨識且安全的文案', (code, expected) => {
    expect(importErrorMessage({ code })).toBe(expected);
  });

  it('不把未知技術錯誤顯示給使用者', () => {
    expect(importErrorMessage(new Error('C:\\secret\\statement.pdf')))
      .toBe('帳單匯入未完成，請檢查檔案、PDF 密碼與待確認內容。');
  });
});
