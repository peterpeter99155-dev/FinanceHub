import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';
import { calculateNetWorth } from '../../src/domain/net-worth';

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
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
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

  it('creates singleton backup settings without storing backup success as truth', () => {
    connection = openBootstrapDatabase(':memory:');
    expect(connection.database.prepare(
      `SELECT automatic_enabled, retention_count,
              next_automatic_backup_at, last_error_code
       FROM backup_settings WHERE id = 1`,
    ).get()).toEqual({
      automatic_enabled: 1,
      retention_count: 7,
      next_automatic_backup_at: null,
      last_error_code: null,
    });
    const columns = connection.database.prepare(
      'PRAGMA table_info(backup_settings)',
    ).all() as { name: string }[];
    expect(columns.map(({ name }) => name)).not.toContain(
      'last_successful_backup_at',
    );
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
      'de61300b8c25603b7073c94e461f17e6851d9475849c352ee202c4e680ca4ab1',
    );
  });

  it('keeps released Sprint 05 financial migrations immutable', () => {
    const source = readFileSync(
      path.resolve(
        'src',
        'infrastructure',
        'database',
        'bootstrap-database.ts',
      ),
      'utf8',
    );
    const start = source.indexOf('const SPRINT_05_MIGRATIONS:');
    const end = source.indexOf('] as const;', start) + 11;
    const migrationBlock = source
      .slice(start, end)
      .replace(/\r\n/g, '\n');

    expect(
      createHash('sha256').update(migrationBlock).digest('hex'),
    ).toBe(
      'b95fe10a2e6802a50faabcb7d0dd6d57f80e2427e3f6322efad7e104d9c90370',
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
      expect(Number(count.count)).toBe(11);
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

  it('upgrades legacy credit cards without changing existing totals', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-credit-card-upgrade-'),
    );
    const databasePath = path.join(directory, 'financehub.db');

    try {
      connection = openBootstrapDatabase(databasePath);
      connection.database.exec(`
        DROP TRIGGER financial_items_credit_card_balance_insert;
        DROP TRIGGER financial_items_credit_card_balance_update;
        DROP TABLE transaction_source_links;
        DROP TABLE import_candidates;
        DROP TABLE source_observations;
        DROP TABLE import_batches;
        DROP TABLE financial_transactions;
        CREATE TABLE financial_transactions (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN (
            'income', 'expense', 'transfer',
            'credit_card_purchase', 'credit_card_payment'
          )),
          amount INTEGER NOT NULL CHECK (
            amount > 0 AND amount <= 999999999999
          ),
          occurred_at TEXT NOT NULL,
          financial_month TEXT NOT NULL,
          source_account_id TEXT,
          destination_account_id TEXT,
          category_id TEXT,
          name TEXT NOT NULL,
          note TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ALTER TABLE financial_items DROP COLUMN overpayment_amount;
        DELETE FROM schema_migrations WHERE version IN (7, 8, 9, 10, 11);
        INSERT INTO financial_items (
          id, name, direction, type, amount, status, updated_at,
          is_active, include_in_net_worth
        ) VALUES
          ('legacy-bank', 'Legacy bank', 'asset', 'bank_deposit', 1000,
           'confirmed', '2026-07-28T08:00:00.000Z', 1, 1),
          ('legacy-card', 'Legacy card', 'liability', 'credit_card', 400,
           'confirmed', '2026-07-28T08:00:00.000Z', 1, 1);
      `);
      const before = { totalAssets: 1_000, totalLiabilities: 400, netWorth: 600 };
      connection.close();

      connection = openBootstrapDatabase(databasePath);
      const items = new SqliteFinancialItemRepository(
        connection.database,
      ).list();
      const card = items.find(({ id }) => id === 'legacy-card');

      expect(card?.amount).toBe(400);
      expect(card?.overpaymentBalance).toBe(0);
      expect(calculateNetWorth(items)).toEqual(before);
      expect(
        connection.database
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get(),
      ).toEqual({ version: 11 });
    } finally {
      connection?.close();
      connection = undefined;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('marks existing transactions as datetime when time precision is introduced', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-time-precision-upgrade-'),
    );
    const databasePath = path.join(directory, 'financehub.db');

    try {
      connection = openBootstrapDatabase(databasePath);
      connection.database.exec(`
        INSERT INTO financial_transactions (
          id, kind, amount, occurred_at, occurred_at_precision,
          financial_month, name, note, created_at, updated_at
        ) VALUES (
          'legacy-transaction', 'expense', 100,
          '2026-07-28T08:00:00.000Z', 'datetime', '2026-07',
          'Legacy transaction', '',
          '2026-07-28T08:00:00.000Z', '2026-07-28T08:00:00.000Z'
        );
        ALTER TABLE financial_transactions DROP COLUMN occurred_at_precision;
        DELETE FROM schema_migrations WHERE version = 9;
      `);
      connection.close();

      connection = openBootstrapDatabase(databasePath);
      expect(
        connection.database
          .prepare(`
            SELECT occurred_at_precision
            FROM financial_transactions
            WHERE id = 'legacy-transaction'
          `)
          .get(),
      ).toEqual({ occurred_at_precision: 'datetime' });
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

    connection.database
      .prepare(`
        INSERT INTO financial_items (
          id, name, direction, type, amount, overpayment_amount,
          status, updated_at, is_active, include_in_net_worth
        ) VALUES (
          'precision-overpayment', 'Precision overpayment',
          'liability', 'credit_card', 0, ?, 'confirmed', ?, 1, 1
        )
      `)
      .run(999_999_999_999, '2026-07-29T00:00:00.000Z');
    const storedOverpayment = connection.database
      .prepare(`
        SELECT overpayment_amount
        FROM financial_items
        WHERE id = 'precision-overpayment'
      `)
      .get() as { overpayment_amount: number };

    expect(storedOverpayment.overpayment_amount).toBe(999_999_999_999);
    expect(typeof storedOverpayment.overpayment_amount).toBe('number');
    expect(Number.isSafeInteger(storedOverpayment.overpayment_amount)).toBe(
      true,
    );

    for (const { amount } of storedFinancialItemAmounts) {
      expect(typeof amount).toBe('number');
      expect(Number.isSafeInteger(amount)).toBe(true);
    }
    expect(typeof storedTransaction.amount).toBe('number');
    expect(Number.isSafeInteger(storedTransaction.amount)).toBe(true);
  });
});
