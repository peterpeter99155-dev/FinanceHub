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

    const migration = connection.database
      .prepare(
        'SELECT version, applied_at FROM schema_migrations WHERE version = ?',
      )
      .get(1) as { version: number; applied_at: string } | undefined;

    expect(migration?.version).toBe(1);
    expect(migration?.applied_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it('enables foreign key checks', () => {
    connection = openBootstrapDatabase(':memory:');

    const foreignKeys = connection.database
      .prepare('PRAGMA foreign_keys')
      .get() as { foreign_keys: number };

    expect(foreignKeys.foreign_keys).toBe(1);
  });
});
