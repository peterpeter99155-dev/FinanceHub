import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialItem } from '../../src/domain/financial-item';
import { createTwdAmount } from '../../src/domain/money';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';

function createItem(
  overrides: Partial<FinancialItem> = {},
): FinancialItem {
  return {
    id: 'asset-1',
    name: '示範銀行存款',
    direction: 'asset',
    type: 'bank_deposit',
    amount: createTwdAmount(1_000_000),
    status: 'confirmed',
    updatedAt: '2026-07-27T08:00:00.000Z',
    isActive: true,
    includeInNetWorth: true,
    ...overrides,
  };
}

describe('SqliteFinancialItemRepository', () => {
  let connection: BootstrapDatabase;
  let repository: SqliteFinancialItemRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    repository = new SqliteFinancialItemRepository(connection.database);
  });

  afterEach(() => {
    connection.close();
  });

  it('creates, finds and lists a financial item', () => {
    const item = createItem();

    repository.create(item);

    expect(repository.findById(item.id)).toEqual(item);
    expect(repository.list()).toEqual([item]);
  });

  it('updates an existing item', () => {
    repository.create(createItem());

    const updated = createItem({
      name: '更新後存款',
      amount: createTwdAmount(1_100_000),
      status: 'estimated',
      updatedAt: '2026-07-27T09:00:00.000Z',
      includeInNetWorth: false,
    });
    repository.update(updated);

    expect(repository.findById(updated.id)).toEqual(updated);
  });

  it('permanently deletes an existing item', () => {
    repository.create(createItem());

    repository.delete('asset-1');

    expect(repository.findById('asset-1')).toBeUndefined();
    expect(repository.list()).toHaveLength(0);
  });

  it('rejects updates and deletion for missing items', () => {
    expect(() => repository.update(createItem())).toThrow('was not found');
    expect(() => repository.delete('missing')).toThrow('was not found');
  });

  it('persists items after the database is reopened', () => {
    connection.close();

    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'financehub-repository-'),
    );
    const databasePath = path.join(
      temporaryDirectory,
      'financehub.test.db',
    );

    try {
      const firstConnection = openBootstrapDatabase(databasePath);
      const firstRepository = new SqliteFinancialItemRepository(
        firstConnection.database,
      );
      firstRepository.create(createItem());
      firstConnection.close();

      const reopenedConnection = openBootstrapDatabase(databasePath);
      const reopenedRepository = new SqliteFinancialItemRepository(
        reopenedConnection.database,
      );

      expect(reopenedRepository.findById('asset-1')).toEqual(
        createItem(),
      );
      reopenedConnection.close();
    } finally {
      connection = openBootstrapDatabase(':memory:');
      rmSync(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });
});
