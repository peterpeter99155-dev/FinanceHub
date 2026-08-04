import { describe, expect, it } from 'vitest';

import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import { calculateNetWorth } from '../../src/domain/net-worth';

function createItem(
  overrides: Partial<FinancialItem> = {},
): FinancialItem {
  return {
    id: 'item-1',
    name: '示範銀行存款',
    direction: 'asset',
    type: 'bank_deposit',
    amount: createTwdAmount(1_000_000),
    overpaymentBalance: createTwdAmount(0),
    status: 'confirmed',
    updatedAt: '2026-07-27T08:00:00.000Z',
    isActive: true,
    includeInNetWorth: true,
    ...overrides,
  };
}

describe('calculateNetWorth', () => {
  it('calculates total assets, liabilities and net worth', () => {
    const result = calculateNetWorth([
      createItem(),
      createItem({
        id: 'property-1',
        name: '示範房產',
        type: 'property',
        amount: createTwdAmount(8_000_000),
      }),
      createItem({
        id: 'mortgage-1',
        name: '示範房貸',
        direction: 'liability',
        type: 'mortgage',
        amount: createTwdAmount(5_000_000),
      }),
    ]);

    expect(result).toEqual({
      totalAssets: 9_000_000,
      totalLiabilities: 5_000_000,
      netWorth: 4_000_000,
    });
  });

  it('excludes inactive, opted-out and pending-confirmation items', () => {
    const result = calculateNetWorth([
      createItem(),
      createItem({
        id: 'inactive',
        isActive: false,
        amount: createTwdAmount(900_000),
      }),
      createItem({
        id: 'excluded',
        includeInNetWorth: false,
        amount: createTwdAmount(800_000),
      }),
      createItem({
        id: 'pending',
        status: 'pending_confirmation',
        amount: createTwdAmount(700_000),
      }),
    ]);

    expect(result).toEqual({
      totalAssets: 1_000_000,
      totalLiabilities: 0,
      netWorth: 1_000_000,
    });
  });

  it('allows liabilities to make net worth negative', () => {
    const result = calculateNetWorth([
      createItem({
        id: 'loan-1',
        name: '示範貸款',
        direction: 'liability',
        type: 'loan',
        amount: createTwdAmount(1_200_000),
      }),
    ]);

    expect(result.netWorth).toBe(-1_200_000);
  });

  it('counts credit card overpayment as an asset, not a negative liability', () => {
    expect(
      calculateNetWorth([
        createItem({
          id: 'card-1',
          name: '示範信用卡',
          direction: 'liability',
          type: 'credit_card',
          amount: createTwdAmount(0),
          overpaymentBalance: createTwdAmount(500),
        }),
      ]),
    ).toEqual({
      totalAssets: 500,
      totalLiabilities: 0,
      netWorth: 500,
    });
  });

  it('rejects a type and direction mismatch', () => {
    expect(() =>
      calculateNetWorth([
        createItem({
          direction: 'liability',
          type: 'cash',
        }),
      ]),
    ).toThrow('must have direction "asset"');
  });

  it('returns zero totals for an empty collection', () => {
    expect(calculateNetWorth([])).toEqual({
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
    });
  });
});
