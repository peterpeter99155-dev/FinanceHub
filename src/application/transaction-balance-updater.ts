import type { FinancialItemRepository } from './ports/financial-item-repository';
import { applyCreditCardBalanceOperation } from '../domain/credit-card-balance';
import type { FinancialItem } from '../domain/financial-item';
import {
  type AccountBalanceEffect,
  applyBalanceEffect,
} from '../domain/transaction';

export function applyTransactionEffects(
  financialItems: FinancialItemRepository,
  effects: readonly AccountBalanceEffect[],
  updatedAt: string,
): void {
  for (const effect of effects) {
    const item = financialItems.findById(effect.accountId);
    if (!item) {
      throw new Error(
        `Transaction account "${effect.accountId}" was not found.`,
      );
    }
    financialItems.update({
      ...item,
      ...(item.type === 'credit_card'
        ? applyCreditCardEffect(item, effect)
        : { amount: applyBalanceEffect(item.amount, effect) }),
      updatedAt,
    });
  }
}

function applyCreditCardEffect(
  item: FinancialItem,
  effect: AccountBalanceEffect,
): Pick<FinancialItem, 'amount' | 'overpaymentBalance'> {
  const result = applyCreditCardBalanceOperation(
    {
      amountDue: item.amount,
      overpaymentBalance: item.overpaymentBalance,
    },
    {
      kind: effect.operation === 'increase' ? 'purchase' : 'refund',
      amount: effect.amount,
    },
  );
  return {
    amount: result.amountDue,
    overpaymentBalance: result.overpaymentBalance,
  };
}
