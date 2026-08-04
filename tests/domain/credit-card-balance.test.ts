import { describe, expect, it } from 'vitest';

import {
  applyCreditCardBalanceOperation,
  applyCreditCardBalanceOperations,
} from '../../src/domain/credit-card-balance';
import { createTwdAmount } from '../../src/domain/money';

const balance = (amountDue: number, overpaymentBalance: number) => ({
  amountDue: createTwdAmount(amountDue),
  overpaymentBalance: createTwdAmount(overpaymentBalance),
});

const operation = (
  kind: 'purchase' | 'refund' | 'payment',
  amount: number,
) => ({ kind, amount: createTwdAmount(amount) });

describe('credit card dual balance', () => {
  it('turns a refund with no amount due into overpayment', () => {
    expect(
      applyCreditCardBalanceOperation(
        balance(0, 0),
        operation('refund', 500),
      ),
    ).toEqual(balance(0, 500));
  });

  it('reduces amount due for a partial refund', () => {
    expect(
      applyCreditCardBalanceOperation(
        balance(1_000, 0),
        operation('refund', 400),
      ),
    ).toEqual(balance(600, 0));
  });

  it('moves the excess of a refund into overpayment', () => {
    expect(
      applyCreditCardBalanceOperation(
        balance(300, 0),
        operation('refund', 500),
      ),
    ).toEqual(balance(0, 200));
  });

  it('consumes overpayment before increasing amount due', () => {
    expect(
      applyCreditCardBalanceOperation(
        balance(0, 300),
        operation('purchase', 500),
      ),
    ).toEqual(balance(200, 0));
  });

  it('moves an excess payment into overpayment', () => {
    expect(
      applyCreditCardBalanceOperation(
        balance(300, 0),
        operation('payment', 500),
      ),
    ).toEqual(balance(0, 200));
  });

  it('has the same final balance regardless of batch order', () => {
    const operations = [
      operation('purchase', 1_000),
      operation('refund', 300),
      operation('payment', 900),
      operation('purchase', 50),
    ] as const;

    expect(
      applyCreditCardBalanceOperations(balance(0, 0), operations),
    ).toEqual(
      applyCreditCardBalanceOperations(
        balance(0, 0),
        [...operations].reverse(),
      ),
    );
  });

  it('rejects a state where both balances are positive', () => {
    expect(() =>
      applyCreditCardBalanceOperation(
        balance(1, 1),
        operation('purchase', 1),
      ),
    ).toThrow('cannot have amount due and overpayment');
  });

  it('rejects zero operations and balances beyond the supported maximum', () => {
    expect(() =>
      applyCreditCardBalanceOperation(
        balance(0, 0),
        operation('refund', 0),
      ),
    ).toThrow('outside the supported range');
    expect(() =>
      applyCreditCardBalanceOperation(
        balance(999_999_999_999, 0),
        operation('purchase', 1),
      ),
    ).toThrow('exceeds the supported range');
  });
});
