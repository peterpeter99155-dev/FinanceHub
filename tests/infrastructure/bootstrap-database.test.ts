import { afterEach, describe, expect, it } from 'vitest';

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
});
