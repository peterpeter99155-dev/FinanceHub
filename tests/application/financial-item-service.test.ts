import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FinancialItemService } from '../../src/application/financial-item-service';
import type { FinancialItemDraft } from '../../src/shared/financial-items';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';

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

  it('deactivates an item while preserving it in storage', () => {
    service.create(ASSET_DRAFT);

    const snapshot = service.deactivate('asset-1');

    expect(snapshot.items[0].isActive).toBe(false);
    expect(snapshot.summary.netWorth).toBe(0);
  });

  it('keeps pending-confirmation items out of official totals', () => {
    const snapshot = service.create({
      ...ASSET_DRAFT,
      status: 'pending_confirmation',
    });

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.summary.netWorth).toBe(0);
  });

  it.each([
    [{ ...ASSET_DRAFT, name: '' }, 'Name'],
    [{ ...ASSET_DRAFT, amount: -1 }, 'cannot be negative'],
    [{ ...ASSET_DRAFT, direction: 'unknown' }, 'direction'],
    [{ ...ASSET_DRAFT, includeInNetWorth: 'yes' }, 'boolean'],
  ])('rejects invalid renderer input %#', (input, message) => {
    expect(() => service.create(input)).toThrow(message);
  });
});
