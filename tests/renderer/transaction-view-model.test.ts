import { describe, expect, it } from 'vitest';

import {
  simpleKindLabel,
  transactionTone,
} from '../../src/renderer/transactionViewModel';

describe('transaction list presentation', () => {
  it('shows a credit card refund as a refund instead of income', () => {
    expect(simpleKindLabel('credit_card_refund')).toBe('信用卡退款');
    expect(simpleKindLabel('credit_card_refund')).not.toBe('收入');
    expect(transactionTone('credit_card_refund')).toBe('neutral');
    expect(transactionTone('credit_card_refund')).not.toBe(
      transactionTone('income'),
    );
  });
});
