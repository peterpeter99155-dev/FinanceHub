import type { TwdAmount } from './money';
import { createTwdAmount } from './money';

export const MAX_CREDIT_CARD_BALANCE_TWD = 999_999_999_999;

export interface CreditCardBalance {
  readonly amountDue: TwdAmount;
  readonly overpaymentBalance: TwdAmount;
}

export type CreditCardBalanceChange =
  | 'purchase'
  | 'refund'
  | 'payment';

export interface CreditCardBalanceOperation {
  readonly kind: CreditCardBalanceChange;
  readonly amount: TwdAmount;
}

export function validateCreditCardBalance(
  balance: CreditCardBalance,
): void {
  if (balance.amountDue > 0 && balance.overpaymentBalance > 0) {
    throw new Error(
      'A credit card cannot have amount due and overpayment at the same time.',
    );
  }
}

export function applyCreditCardBalanceOperation(
  balance: CreditCardBalance,
  operation: CreditCardBalanceOperation,
): CreditCardBalance {
  validateCreditCardBalance(balance);

  if (
    operation.amount <= 0 ||
    operation.amount > MAX_CREDIT_CARD_BALANCE_TWD
  ) {
    throw new Error('Credit card operation amount is outside the supported range.');
  }

  const currentNet = balance.amountDue - balance.overpaymentBalance;
  const direction = operation.kind === 'purchase' ? 1 : -1;
  const nextNet = currentNet + direction * operation.amount;

  if (
    !Number.isSafeInteger(nextNet) ||
    Math.abs(nextNet) > MAX_CREDIT_CARD_BALANCE_TWD
  ) {
    throw new Error('Credit card balance exceeds the supported range.');
  }

  return nextNet >= 0
    ? {
        amountDue: createTwdAmount(nextNet),
        overpaymentBalance: createTwdAmount(0),
      }
    : {
        amountDue: createTwdAmount(0),
        overpaymentBalance: createTwdAmount(-nextNet),
      };
}

export function applyCreditCardBalanceOperations(
  balance: CreditCardBalance,
  operations: readonly CreditCardBalanceOperation[],
): CreditCardBalance {
  return operations.reduce(applyCreditCardBalanceOperation, balance);
}
