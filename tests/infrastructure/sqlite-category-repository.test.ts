import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FinancialCategory } from '../../src/domain/category';
import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteCategoryRepository } from '../../src/infrastructure/database/sqlite-category-repository';

function category(
  overrides: Partial<FinancialCategory> = {},
): FinancialCategory {
  return {
    id: 'expense-late-night-snack',
    kind: 'expense',
    name: '宵夜',
    isBuiltIn: false,
    isActive: true,
    ...overrides,
  };
}

describe('SqliteCategoryRepository', () => {
  let connection: BootstrapDatabase;
  let repository: SqliteCategoryRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    repository = new SqliteCategoryRepository(connection.database);
  });

  afterEach(() => {
    connection.close();
  });

  it('creates, updates, lists and deletes an unused category', () => {
    repository.create(category());

    expect(repository.findById('expense-late-night-snack')).toEqual(
      category(),
    );

    repository.update(category({ name: '餐飲', isActive: false }));
    expect(repository.findById('expense-late-night-snack')).toEqual(
      category({ name: '餐飲', isActive: false }),
    );

    repository.delete('expense-late-night-snack');
    expect(
      repository.findById('expense-late-night-snack'),
    ).toBeUndefined();
  });

  it('rejects duplicate active names within the same kind', () => {
    repository.create(category());

    expect(() =>
      repository.create(
        category({
          id: 'expense-food-2',
          name: ' 飲食 ',
        }),
      ),
    ).toThrow('same name');

    expect(() =>
      repository.create(
        category({
          id: 'income-food',
          kind: 'income',
        }),
      ),
    ).not.toThrow();
  });

  it('prevents modifying or deleting built-in categories', () => {
    const builtIn = repository.findById('expense-food');

    expect(builtIn).toBeDefined();
    expect(() =>
      repository.update({
        ...builtIn!,
        name: '修改後飲食',
      }),
    ).toThrow('cannot be modified');
    expect(() => repository.delete('expense-food')).toThrow(
      'cannot be deleted',
    );
  });

  it('requires transactions to be reassigned before deleting a used category', () => {
    repository.create(category());
    connection.database.exec(`
      INSERT INTO financial_items (
        id, name, direction, type, amount, status, updated_at,
        is_active, include_in_net_worth
      ) VALUES (
        'cash-1', '現金', 'asset', 'cash', 1000, 'confirmed',
        '2026-07-28T08:00:00.000Z', 1, 1
      );

      INSERT INTO financial_transactions (
        id, kind, amount, occurred_at, financial_month,
        source_account_id, destination_account_id, category_id,
        name, note, created_at, updated_at
      ) VALUES (
        'expense-1', 'expense', 100, '2026-07-28T07:00:00.000Z',
        '2026-07', 'cash-1', NULL, 'expense-late-night-snack', '', '',
        '2026-07-28T08:00:00.000Z', '2026-07-28T08:00:00.000Z'
      );
    `);

    expect(() => repository.delete('expense-late-night-snack')).toThrow(
      'used by 1 transaction',
    );
    expect(() =>
      repository.update(
        category({
          kind: 'income',
          name: '錯誤收入',
        }),
      ),
    ).toThrow('cannot change between income and expense');

    repository.reassignAndDelete(
      'expense-late-night-snack',
      'expense-other',
    );

    expect(
      repository.findById('expense-late-night-snack'),
    ).toBeUndefined();
    expect(repository.countTransactions('expense-other')).toBe(1);
  });
});
