import {
  FinancialItem,
  isIncludedInOfficialNetWorth,
  validateFinancialItem,
} from './financial-item';
import {
  TwdAmount,
  ZERO_TWD,
  addTwdAmounts,
  createTwdAmount,
} from './money';

export interface NetWorthSummary {
  readonly totalAssets: TwdAmount;
  readonly totalLiabilities: TwdAmount;
  readonly netWorth: number;
}

export function calculateNetWorth(
  items: readonly FinancialItem[],
): NetWorthSummary {
  let totalAssets = ZERO_TWD;
  let totalLiabilities = ZERO_TWD;

  for (const item of items) {
    validateFinancialItem(item);

    if (!isIncludedInOfficialNetWorth(item)) {
      continue;
    }

    if (item.direction === 'asset') {
      totalAssets = addTwdAmounts(totalAssets, item.amount);
    } else {
      totalLiabilities = addTwdAmounts(totalLiabilities, item.amount);
      if (item.type === 'credit_card') {
        totalAssets = addTwdAmounts(
          totalAssets,
          item.overpaymentBalance,
        );
      }
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  if (!Number.isSafeInteger(netWorth)) {
    throw new Error('Net worth exceeds the supported range.');
  }

  return {
    totalAssets: createTwdAmount(totalAssets),
    totalLiabilities: createTwdAmount(totalLiabilities),
    netWorth,
  };
}
