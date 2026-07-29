import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  openExistingEncryptedDatabase,
  openOrCreateEncryptedDatabase,
} from '../../src/infrastructure/database/encrypted-database';

const FIXTURE_PASSWORD =
  'FinanceHub v1 fixture password for fake data only';
const FIXTURE_DIRECTORY = path.resolve(
  'tests',
  'fixtures',
  'encryption-v1',
);
const FIXTURE_DATABASE = path.join(
  FIXTURE_DIRECTORY,
  'financehub-v1.db',
);
const FIXTURE_METADATA = `${FIXTURE_DATABASE}.metadata.json`;

describe('encrypted database v1 compatibility fixture', () => {
  let temporaryDirectory: string | undefined;

  beforeAll(async () => {
    if (process.env.FINANCEHUB_GENERATE_ENCRYPTION_V1_FIXTURE === '1') {
      await generateFixture();
    }
  });

  afterEach(() => {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it('opens the committed v1 fixture and reads its fixed fake data', async () => {
    temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'financehub-v1-compatibility-'),
    );
    const databasePath = path.join(
      temporaryDirectory,
      'financehub-v1.db',
    );
    copyFileSync(FIXTURE_DATABASE, databasePath);
    copyFileSync(FIXTURE_METADATA, `${databasePath}.metadata.json`);

    const connection = await openExistingEncryptedDatabase(
      databasePath,
      FIXTURE_PASSWORD,
    );
    try {
      const item = connection.database
        .prepare(
          'SELECT name, amount FROM financial_items WHERE id = ?',
        )
        .get('fixture-bank') as { name: string; amount: number };
      expect(item).toEqual({
        name: '加密相容性測試銀行',
        amount: 123456789,
      });

      const migrationVersion = connection.database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get() as { version: number };
      expect(migrationVersion.version).toBeGreaterThanOrEqual(5);
    } finally {
      connection.close();
    }

    const metadata = JSON.parse(
      readFileSync(FIXTURE_METADATA, 'utf8'),
    ) as { formatVersion: number; kdfVersion: number };
    expect(metadata.formatVersion).toBe(1);
    expect(metadata.kdfVersion).toBe(1);
  });
});

async function generateFixture(): Promise<void> {
  mkdirSync(FIXTURE_DIRECTORY, { recursive: true });
  rmSync(FIXTURE_DATABASE, { force: true });
  rmSync(FIXTURE_METADATA, { force: true });
  const connection = await openOrCreateEncryptedDatabase(
    FIXTURE_DATABASE,
    FIXTURE_PASSWORD,
  );
  try {
    connection.database
      .prepare(`
        INSERT INTO financial_items (
          id, name, direction, type, amount, status, updated_at,
          is_active, include_in_net_worth
        ) VALUES (?, ?, 'asset', 'bank_deposit', ?, 'confirmed', ?, 1, 1)
      `)
      .run(
        'fixture-bank',
        '加密相容性測試銀行',
        123456789,
        '2026-07-29T00:00:00.000Z',
      );
  } finally {
    connection.close();
  }
}
