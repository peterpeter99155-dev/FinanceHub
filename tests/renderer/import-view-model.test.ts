import { describe, expect, it } from 'vitest';

import { IMPORT_WARNING_LABELS } from '../../src/renderer/importViewModel';
import { IMPORT_WARNING_CODES } from '../../src/shared/import-warning-codes';

describe('import warning labels', () => {
  it('maps the warning codes emitted by the production PDF parser', () => {
    expect(
      IMPORT_WARNING_LABELS[IMPORT_WARNING_CODES.zeroAmountNotImportable],
    ).toBe('這筆金額為零，請選擇排除或修正金額。');
    expect(
      IMPORT_WARNING_LABELS[
        IMPORT_WARNING_CODES.negativeItemRequiresUserConfirmation
      ],
    ).toBe('無法判斷這筆扣抵或退款，請指定交易類型。');
    expect(
      IMPORT_WARNING_LABELS[
        IMPORT_WARNING_CODES.splitDescriptionFragmentCountUnsupported
      ],
    ).toBe('摘要跨行，請確認內容是否完整。');
  });

  it('does not retain the prototype-only warning codes', () => {
    expect(IMPORT_WARNING_LABELS).not.toHaveProperty(
      'UNKNOWN_NEGATIVE_REVIEW_REQUIRED',
    );
    expect(IMPORT_WARNING_LABELS).not.toHaveProperty(
      'ZERO_AMOUNT_REVIEW_REQUIRED',
    );
    expect(IMPORT_WARNING_LABELS).not.toHaveProperty(
      'SPLIT_SUMMARY_REVIEW_REQUIRED',
    );
  });
});
