import {
  openSqliteDatabase,
  SqliteDatabase,
} from './sqlite-database';

interface Migration {
  readonly version: number;
  readonly sql: string;
}

// 已發布的 migration 必須保持不可變；schema 或 seed 的任何後續調整，
// 都必須新增更高版本的 migration，不得回頭修改既有項目。
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
  {
    version: 3,
    sql: `
      CREATE TABLE financial_categories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
        name TEXT NOT NULL CHECK (
          length(trim(name)) BETWEEN 1 AND 20
        ),
        is_built_in INTEGER NOT NULL CHECK (is_built_in IN (0, 1)),
        is_active INTEGER NOT NULL CHECK (is_active IN (0, 1))
      );

      CREATE UNIQUE INDEX financial_categories_active_name_idx
        ON financial_categories (kind, name COLLATE NOCASE)
        WHERE is_active = 1;

      CREATE TABLE financial_transactions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (
          kind IN (
            'income',
            'expense',
            'transfer',
            'credit_card_purchase',
            'credit_card_payment'
          )
        ),
        amount INTEGER NOT NULL CHECK (
          amount > 0 AND amount <= 999999999999
        ),
        occurred_at TEXT NOT NULL,
        financial_month TEXT NOT NULL CHECK (
          financial_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        ),
        source_account_id TEXT,
        destination_account_id TEXT,
        category_id TEXT,
        name TEXT NOT NULL CHECK (length(trim(name)) <= 50),
        note TEXT NOT NULL CHECK (length(trim(note)) <= 200),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_account_id)
          REFERENCES financial_items (id) ON DELETE RESTRICT,
        FOREIGN KEY (destination_account_id)
          REFERENCES financial_items (id) ON DELETE RESTRICT,
        FOREIGN KEY (category_id)
          REFERENCES financial_categories (id) ON DELETE RESTRICT
      );

      CREATE INDEX financial_transactions_month_time_idx
        ON financial_transactions (
          financial_month,
          occurred_at DESC,
          id ASC
        );

      CREATE INDEX financial_transactions_source_account_idx
        ON financial_transactions (source_account_id);

      CREATE INDEX financial_transactions_destination_account_idx
        ON financial_transactions (destination_account_id);

      CREATE INDEX financial_transactions_category_idx
        ON financial_transactions (category_id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE financial_item_custom_types (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK (
          direction IN ('asset', 'liability')
        ),
        name TEXT NOT NULL CHECK (
          length(trim(name)) BETWEEN 1 AND 20
        ),
        is_active INTEGER NOT NULL CHECK (is_active IN (0, 1))
      );

      CREATE UNIQUE INDEX financial_item_custom_types_active_name_idx
        ON financial_item_custom_types (direction, name COLLATE NOCASE)
        WHERE is_active = 1;

      ALTER TABLE financial_items
        ADD COLUMN custom_type_id TEXT
        REFERENCES financial_item_custom_types (id) ON DELETE RESTRICT;

      CREATE INDEX financial_items_custom_type_idx
        ON financial_items (custom_type_id);

      INSERT OR IGNORE INTO financial_categories (
        id, kind, name, is_built_in, is_active
      ) VALUES
        ('income-salary', 'income', '薪資', 1, 1),
        ('income-bonus', 'income', '獎金', 1, 1),
        ('income-interest', 'income', '利息', 1, 1),
        ('income-investment', 'income', '投資收入', 1, 1),
        ('income-other', 'income', '其他', 1, 1),
        ('expense-food', 'expense', '飲食', 1, 1),
        ('expense-transportation', 'expense', '交通', 1, 1),
        ('expense-housing', 'expense', '居住', 1, 1),
        ('expense-communication', 'expense', '通訊', 1, 1),
        ('expense-entertainment', 'expense', '娛樂', 1, 1),
        ('expense-medical', 'expense', '醫療', 1, 1),
        ('expense-education', 'expense', '教育', 1, 1),
        ('expense-insurance', 'expense', '保險', 1, 1),
        ('expense-tax', 'expense', '稅費', 1, 1),
        ('expense-other', 'expense', '其他', 1, 1);
    `,
  },
  {
    version: 5,
    sql: `
      INSERT OR IGNORE INTO financial_categories (
        id, kind, name, is_built_in, is_active
      ) VALUES
        ('income-salary', 'income', '薪資', 1, 1),
        ('income-bonus', 'income', '獎金', 1, 1),
        ('income-interest', 'income', '利息', 1, 1),
        ('income-investment', 'income', '投資收入', 1, 1),
        ('income-other', 'income', '其他', 1, 1),
        ('expense-food', 'expense', '飲食', 1, 1),
        ('expense-transportation', 'expense', '交通', 1, 1),
        ('expense-housing', 'expense', '居住', 1, 1),
        ('expense-communication', 'expense', '通訊', 1, 1),
        ('expense-entertainment', 'expense', '娛樂', 1, 1),
        ('expense-medical', 'expense', '醫療', 1, 1),
        ('expense-education', 'expense', '教育', 1, 1),
        ('expense-insurance', 'expense', '保險', 1, 1),
        ('expense-tax', 'expense', '稅費', 1, 1),
        ('expense-other', 'expense', '其他', 1, 1);
    `,
  },
] as const;

export interface BootstrapDatabase {
  readonly database: SqliteDatabase;
  close(): void;
}

export function openBootstrapDatabase(databasePath: string): BootstrapDatabase {
  const database = openSqliteDatabase(databasePath);

  try {
    bootstrapDatabaseConnection(database);
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    database,
    close: () => database.close(),
  };
}

export function bootstrapDatabaseConnection(
  database: SqliteDatabase,
): void {
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
}

function applyMigration(
  database: SqliteDatabase,
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
