import { describe, expect, it } from 'vitest';

import { FinancialItemCustomTypeService } from '../../src/application/financial-item-custom-type-service';
import { createTwdAmount } from '../../src/domain/money';
import {
  InMemoryFinanceStore,
  customTypeRepository,
  financialItemRepository,
} from './in-memory-finance-store';

describe('FinancialItemCustomTypeService', () => {
  it('keeps used-type decisions in the application layer', () => {
    const store = new InMemoryFinanceStore();
    store.customTypes.set('emergency-fund', {
      id: 'emergency-fund',
      direction: 'asset',
      name: '緊急預備金',
      isActive: true,
    });
    store.items.set('item-1', {
      id: 'item-1',
      direction: 'asset',
      type: 'custom_asset',
      customTypeId: 'emergency-fund',
      name: '我的預備金',
      amount: createTwdAmount(10_000),
      overpaymentBalance: createTwdAmount(0),
      status: 'confirmed',
      updatedAt: '2026-07-28T08:00:00.000Z',
      isActive: true,
      includeInNetWorth: true,
    });
    const service = new FinancialItemCustomTypeService(
      customTypeRepository(store),
      financialItemRepository(store),
    );

    expect(() =>
      service.update('emergency-fund', {
        direction: 'asset',
        name: '緊急預備金',
        isActive: false,
      }),
    ).toThrow('cannot be deactivated');
    expect(() =>
      service.update('emergency-fund', {
        direction: 'liability',
        name: '緊急預備金',
        isActive: true,
      }),
    ).toThrow('cannot change between asset and liability');
    expect(() => service.delete('emergency-fund')).toThrow(
      'used by 1 item',
    );
  });
});
