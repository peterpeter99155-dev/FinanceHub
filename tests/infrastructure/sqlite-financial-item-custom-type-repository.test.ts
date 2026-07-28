import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialItemCustomType } from '../../src/domain/financial-item-custom-type';
import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemCustomTypeRepository } from '../../src/infrastructure/database/sqlite-financial-item-custom-type-repository';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';

function customType(
  overrides: Partial<FinancialItemCustomType> = {},
): FinancialItemCustomType {
  return {
    id: 'asset-emergency-fund',
    direction: 'asset',
    name: '緊急預備金',
    isActive: true,
    ...overrides,
  };
}

function item(
  overrides: Partial<FinancialItem> = {},
): FinancialItem {
  return {
    id: 'item-1',
    name: '緊急預備金',
    direction: 'asset',
    type: 'custom_asset',
    customTypeId: 'asset-emergency-fund',
    amount: createTwdAmount(10_000),
    status: 'confirmed',
    updatedAt: '2026-07-28T08:00:00.000Z',
    isActive: true,
    includeInNetWorth: true,
    ...overrides,
  };
}

describe('SqliteFinancialItemCustomTypeRepository', () => {
  let connection: BootstrapDatabase;
  let types: SqliteFinancialItemCustomTypeRepository;
  let items: SqliteFinancialItemRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    types = new SqliteFinancialItemCustomTypeRepository(
      connection.database,
    );
    items = new SqliteFinancialItemRepository(connection.database);
  });

  afterEach(() => {
    connection.close();
  });

  it('creates, renames, deactivates and deletes an unused custom type', () => {
    types.create(customType());
    expect(types.findById('asset-emergency-fund')).toEqual(customType());

    types.update(
      customType({
        name: '備用金',
        isActive: false,
      }),
    );
    expect(types.findById('asset-emergency-fund')).toEqual(
      customType({
        name: '備用金',
        isActive: false,
      }),
    );

    types.delete('asset-emergency-fund');
    expect(types.findById('asset-emergency-fund')).toBeUndefined();
  });

  it('prevents deletion, deactivation or direction changes after the type is used', () => {
    types.create(customType());
    items.create(item());

    expect(types.countItems('asset-emergency-fund')).toBe(1);
    expect(() => types.delete('asset-emergency-fund')).toThrow(
      'used by 1 item',
    );
    expect(() =>
      types.update(customType({ isActive: false })),
    ).toThrow('cannot be deactivated');
    expect(() =>
      types.update(
        customType({
          direction: 'liability',
        }),
      ),
    ).toThrow('cannot change between asset and liability');
  });

  it('prevents duplicate active names in the same direction', () => {
    types.create(customType());

    expect(() =>
      types.create(
        customType({
          id: 'asset-emergency-fund-2',
          name: ' 緊急預備金 ',
        }),
      ),
    ).toThrow('same name');
  });
});
