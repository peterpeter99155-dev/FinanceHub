import { DatabaseSync } from 'node:sqlite';

interface Migration {
  readonly version: number;
  readonly sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    sql: `
      CREATE TABLE financial_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('asset', 'liability')),
        type TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
        include_in_net_worth INTEGER NOT NULL
          CHECK (include_in_net_worth IN (0, 1))
      );

      CREATE INDEX financial_items_active_direction_idx
        ON financial_items (is_active, direction);
    `,
  },
] as const;

export interface BootstrapDatabase {
  readonly database: DatabaseSync;
  close(): void;
}

export function openBootstrapDatabase(databasePath: string): BootstrapDatabase {
  const database = new DatabaseSync(databasePath);

  try {
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    database
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version, applied_at)
         VALUES (?, ?)`,
      )
      .run(1, new Date().toISOString());

    for (const migration of MIGRATIONS) {
      applyMigration(database, migration);
    }
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    database,
    close: () => database.close(),
  };
}

function applyMigration(
  database: DatabaseSync,
  migration: Migration,
): void {
  const existing = database
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get(migration.version);

  if (existing) {
    return;
  }

  database.exec('BEGIN IMMEDIATE;');

  try {
    database.exec(migration.sql);
    database
      .prepare(
        `INSERT INTO schema_migrations (version, applied_at)
         VALUES (?, ?)`,
      )
      .run(migration.version, new Date().toISOString());
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
