import Database from 'better-sqlite3-multiple-ciphers';

export type SqliteDatabase = Database.Database;

export function openSqliteDatabase(databasePath: string): SqliteDatabase {
  return new Database(databasePath);
}
