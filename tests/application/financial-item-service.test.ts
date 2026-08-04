import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FinancialItemService } from '../../src/application/financial-item-service';
import type { FinancialItemDraft } from '../../src/shared/financial-items';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';
import { SqliteFinancialItemCustomTypeRepository } from '../../src/infrastructure/database/sqlite-financial-item-custom-type-repository';
import { SqliteTransactionRepository } from '../../src/infrastructure/database/sqlite-transaction-repository';

const ASSET_DRAFT: FinancialItemDraft = {
  name: '示範銀行存款',
  direction: 'asset',
  type: 'bank_deposit',
  amount: 1_000_000,
  status: 'confirmed',
  includeInNetWorth: true,
};

describe('FinancialItemService', () => {
  let connection: BootstrapDatabase;
  let service: FinancialItemService;
  let currentTime: string;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    currentTime = '2026-07-27T08:00:00.000Z';
    service = new FinancialItemService(
      new SqliteFinancialItemRepository(connection.database),
      () => 'asset-1',
      () => currentTime,
      undefined,
      new SqliteTransactionRepository(connection.database),
    );
  });

  afterEach(() => {
    connection.close();
  });

  it('creates an item and returns a recalculated snapshot', () => {
    const snapshot = service.create(ASSET_DRAFT);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      id: 'asset-1',
      name: '示範銀行存款',
      amount: 1_000_000,
      updatedAt: currentTime,
      isActive: true,
    });
    expect(snapshot.summary).toEqual({
      totalAssets: 1_000_000,
      totalLiabilities: 0,
      netWorth: 1_000_000,
    });
  });

  it('uses the type label when the optional name is blank', () => {
    const snapshot = service.create({
      ...ASSET_DRAFT,
      name: '   ',
      type: 'cash',
    });

    expect(snapshot.items[0].name).toBe('現金');
  });

  it('uses the selected custom type name when the item name is blank', () => {
    const customTypes = new SqliteFinancialItemCustomTypeRepository(
      connection.database,
    );
    customTypes.create({
      id: 'asset-emergency-fund',
      direction: 'asset',
      name: '緊急預備金',
      isActive: true,
    });
    service = new FinancialItemService(
      new SqliteFinancialItemRepository(connection.database),
      () => 'asset-1',
      () => currentTime,
      customTypes,
      new SqliteTransactionRepository(connection.database),
    );

    const snapshot = service.create({
      ...ASSET_DRAFT,
      name: '',
      type: 'custom_asset',
      customTypeId: 'asset-emergency-fund',
    });

    expect(snapshot.items[0]).toMatchObject({
      name: '緊急預備金',
      type: 'custom_asset',
      customTypeId: 'asset-emergency-fund',
    });
  });

  it('allows duplicate names because ids remain unique', () => {
    let idSequence = 0;
    service = new FinancialItemService(
      new SqliteFinancialItemRepository(connection.database),
      () => `asset-${++idSequence}`,
      () => currentTime,
      undefined,
      new SqliteTransactionRepository(connection.database),
    );

    service.create(ASSET_DRAFT);
    const snapshot = service.create(ASSET_DRAFT);

    expect(snapshot.items.map(({ name }) => name)).toEqual([
      '示範銀行存款',
      '示範銀行存款',
    ]);
  });

  it('updates an item and recalculates the snapshot', () => {
    service.create(ASSET_DRAFT);
    currentTime = '2026-07-27T09:00:00.000Z';

    const snapshot = service.update('asset-1', {
      ...ASSET_DRAFT,
      amount: 1_100_000,
    });

    expect(snapshot.items[0]).toMatchObject({
      amount: 1_100_000,
      updatedAt: currentTime,
    });
    expect(snapshot.summary.netWorth).toBe(1_100_000);
  });

  it('permanently deletes an item', () => {
    service.create(ASSET_DRAFT);

    const snapshot = service.delete('asset-1');

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.summary.netWorth).toBe(0);
  });

  it('prevents permanent deletion after an item has transaction history', () => {
    service.create(ASSET_DRAFT);
    connection.database.exec(`
      INSERT INTO financial_transactions (
        id, kind, amount, occurred_at, financial_month,
        source_account_id, destination_account_id, category_id,
        name, note, created_at, updated_at
      ) VALUES (
        'expense-1', 'expense', 100, '2026-07-27T07:00:00.000Z',
        '2026-07', 'asset-1', NULL, 'expense-other', '', '',
        '2026-07-27T08:00:00.000Z', '2026-07-27T08:00:00.000Z'
      );
    `);

    expect(() => service.delete('asset-1')).toThrow(
      'has transaction history',
    );
    expect(service.list().items).toHaveLength(1);
  });

  it('keeps pending-confirmation items out of official totals', () => {
    const snapshot = service.create({
      ...ASSET_DRAFT,
      status: 'pending_confirmation',
    });

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.summary.netWorth).toBe(0);
  });

  it('allows a new credit card with no amount due', () => {
    const snapshot = service.create({
      ...ASSET_DRAFT,
      direction: 'liability',
      type: 'credit_card',
      amount: 0,
    });

    expect(snapshot.items[0]).toMatchObject({
      type: 'credit_card',
      amount: 0,
      overpaymentBalance: 0,
    });
  });

  it.each([
    [{ ...ASSET_DRAFT, name: 'x'.repeat(101) }, '100 characters'],
    [{ ...ASSET_DRAFT, amount: 0 }, 'greater than zero'],
    [{ ...ASSET_DRAFT, amount: -1 }, 'cannot be negative'],
    [{ ...ASSET_DRAFT, amount: 1_000_000_000_000 }, 'allowed maximum'],
    [{ ...ASSET_DRAFT, direction: 'unknown' }, 'direction'],
    [{ ...ASSET_DRAFT, includeInNetWorth: 'yes' }, 'boolean'],
  ])('rejects invalid renderer input %#', (input, message) => {
    expect(() => service.create(input)).toThrow(message);
  });
});
