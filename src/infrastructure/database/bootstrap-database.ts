import { DatabaseSync } from 'node:sqlite';

export interface BootstrapDatabase {
  readonly database: DatabaseSync;
  close(): void;
}

export function openBootstrapDatabase(databasePath: string): BootstrapDatabase {
  const database = new DatabaseSync(databasePath);

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

  return {
    database,
    close: () => database.close(),
  };
}
