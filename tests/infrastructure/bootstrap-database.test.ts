import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';

describe('openBootstrapDatabase', () => {
  let connection: BootstrapDatabase | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
  });

  it('applies the initial migration to a new database', () => {
    connection = openBootstrapDatabase(':memory:');

    const migrations = connection.database
      .prepare(
        'SELECT version, applied_at FROM schema_migrations ORDER BY version',
      )
      .all() as unknown as {
      version: number;
      applied_at: string;
    }[];

    expect(migrations.map(({ version }) => version)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const migration of migrations) {
      expect(migration.applied_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    }
  });

  it('enables foreign key checks', () => {
    connection = openBootstrapDatabase(':memory:');

    const foreignKeys = connection.database
      .prepare('PRAGMA foreign_keys')
      .get() as { foreign_keys: number };

    expect(foreignKeys.foreign_keys).toBe(1);
  });

  it('creates transaction tables and indexes', () => {
    connection = openBootstrapDatabase(':memory:');

    const objects = connection.database
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE name IN (
           'financial_categories',
           'financial_transactions',
           'financial_transactions_month_time_idx'
         )
         ORDER BY name`,
      )
      .all() as unknown as { name: string }[];

    expect(objects.map(({ name }) => name)).toEqual([
      'financial_categories',
      'financial_transactions',
      'financial_transactions_month_time_idx',
    ]);
  });

  it('keeps released migration definitions immutable', () => {
    const source = readFileSync(
      path.resolve(
        'src',
        'infrastructure',
        'database',
        'bootstrap-database.ts',
      ),
      'utf8',
    );
    const start = source.indexOf('const MIGRATIONS:');
    const end = source.indexOf('] as const;', start) + 11;
    const migrationBlock = source
      .slice(start, end)
      .replace(/\r\n/g, '\n');

    expect(
      createHash('sha256').update(migrationBlock).digest('hex'),
    ).toBe(
      '77c605085348349d47a8a622456b8534a06587923207844bb92b38bf462f9c62',
    );
  });

  it('can reopen the same database without reapplying migrations or losing data', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-migration-repeat-'),
    );
    const databasePath = path.join(directory, 'financehub.db');

    try {
      connection = openBootstrapDatabase(databasePath);
      connection.database.exec(`
        INSERT INTO financial_items (
          id, name, direction, type, amount, status, updated_at,
          is_active, include_in_net_worth
        ) VALUES (
          'cash-1', '測試現金', 'asset', 'cash', 1000, 'confirmed',
          '2026-07-28T08:00:00.000Z', 1, 1
        );
      `);
      connection.close();
      connection = openBootstrapDatabase(databasePath);

      const item = connection.database
        .prepare(
          'SELECT name, amount FROM financial_items WHERE id = ?',
        )
        .get('cash-1') as { name: string; amount: number };
      const count = connection.database
        .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
        .get() as { count: number };

      expect(item).toEqual({ name: '測試現金', amount: 1000 });
      expect(Number(count.count)).toBe(5);
    } finally {
      connection?.close();
      connection = undefined;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('applies a pending seed migration without changing existing user data', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-migration-upgrade-'),
    );
    const databasePath = path.join(directory, 'financehub.db');

    try {
      connection = openBootstrapDatabase(databasePath);
      connection.database.exec(`
        INSERT INTO financial_items (
          id, name, direction, type, amount, status, updated_at,
          is_active, include_in_net_worth
        ) VALUES (
          'cash-1', '保留的現金', 'asset', 'cash', 2500, 'confirmed',
          '2026-07-28T08:00:00.000Z', 1, 1
        );
        DELETE FROM financial_categories WHERE id = 'income-salary';
        DELETE FROM schema_migrations WHERE version = 5;
      `);
      connection.close();
      connection = openBootstrapDatabase(databasePath);

      const item = connection.database
        .prepare(
          'SELECT name, amount FROM financial_items WHERE id = ?',
        )
        .get('cash-1') as { name: string; amount: number };
      const restoredSeed = connection.database
        .prepare(
          'SELECT COUNT(*) AS count FROM financial_categories WHERE id = ?',
        )
        .get('income-salary') as { count: number };

      expect(item).toEqual({ name: '保留的現金', amount: 2500 });
      expect(Number(restoredSeed.count)).toBe(1);
    } finally {
      connection?.close();
      connection = undefined;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves supported monetary integers through a database round trip', () => {
    connection = openBootstrapDatabase(':memory:');

    const financialItemAmounts = [
      999_999_999_999,
      999_999_999_998,
      1,
      0,
    ] as const;
    const insertFinancialItem = connection.database.prepare(`
      INSERT INTO financial_items (
        id, name, direction, type, amount, status, updated_at,
        is_active, include_in_net_worth
      ) VALUES (?, ?, 'asset', 'cash', ?, 'confirmed', ?, 1, 1)
    `);

    financialItemAmounts.forEach((amount, index) => {
      insertFinancialItem.run(
        `precision-item-${index}`,
        `Precision item ${index}`,
        amount,
        '2026-07-29T00:00:00.000Z',
      );
    });

    connection.database
      .prepare(`
        INSERT INTO financial_transactions (
          id, kind, amount, occurred_at, financial_month,
          source_account_id, destination_account_id, category_id,
          name, note, created_at, updated_at
        ) VALUES (
          ?, 'expense', ?, ?, ?, NULL, NULL, NULL, ?, '', ?, ?
        )
      `)
      .run(
        'precision-transaction',
        999_999_999_999,
        '2026-07-29T00:00:00.000Z',
        '2026-07',
        'Precision transaction',
        '2026-07-29T00:00:00.000Z',
        '2026-07-29T00:00:00.000Z',
      );

    const storedFinancialItemAmounts = connection.database
      .prepare(`
        SELECT amount
        FROM financial_items
        WHERE id LIKE 'precision-item-%'
        ORDER BY id
      `)
      .all() as { amount: number }[];
    const storedTransaction = connection.database
      .prepare(`
        SELECT amount
        FROM financial_transactions
        WHERE id = ?
      `)
      .get('precision-transaction') as { amount: number };

    expect(storedFinancialItemAmounts.map(({ amount }) => amount)).toEqual(
      financialItemAmounts,
    );
    expect(storedTransaction.amount).toBe(999_999_999_999);

    for (const { amount } of storedFinancialItemAmounts) {
      expect(typeof amount).toBe('number');
      expect(Number.isSafeInteger(amount)).toBe(true);
    }
    expect(typeof storedTransaction.amount).toBe('number');
    expect(Number.isSafeInteger(storedTransaction.amount)).toBe(true);
  });
});
