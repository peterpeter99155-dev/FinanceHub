import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialItemCustomType } from '../../src/domain/financial-item-custom-type';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemCustomTypeRepository } from '../../src/infrastructure/database/sqlite-financial-item-custom-type-repository';

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

describe('SqliteFinancialItemCustomTypeRepository', () => {
  let connection: BootstrapDatabase;
  let types: SqliteFinancialItemCustomTypeRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    types = new SqliteFinancialItemCustomTypeRepository(
      connection.database,
    );
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
