import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  openExistingEncryptedDatabase,
  openOrCreateEncryptedDatabase,
} from '../../src/infrastructure/database/encrypted-database';
import { ERROR_CODES } from '../../src/shared/errors';
import * as newPasswordPolicy from '../../src/shared/security-password';

const TEST_PASSWORD = 'S3-Core-Fixed-Password!';
const WRONG_TEST_PASSWORD = 'S3-Core-Wrong-Password!';

describe('encrypted database core', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it('rejects non-ASCII characters when creating a new database', async () => {
    const databasePath = createDatabasePath();

    await expect(
      openOrCreateEncryptedDatabase(databasePath, '中文Password123!'),
    ).rejects.toMatchObject({
      code: ERROR_CODES.invalidPassword,
    });

    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}.metadata.json`)).toBe(false);
  });

  it('unlocks an existing database created with a Chinese password', async () => {
    const databasePath = createDatabasePath();
    const legacyPassword = `舊版中文密碼${'A'.repeat(65)}`;
    expect(
      newPasswordPolicy.isValidNewPassword(legacyPassword),
    ).toBe(false);

    const legacySetup = vi
      .spyOn(newPasswordPolicy, 'isValidNewPassword')
      .mockReturnValue(true);
    try {
      const legacyConnection =
        await openOrCreateEncryptedDatabase(
          databasePath,
          legacyPassword,
        );
      legacyConnection.close();
    } finally {
      legacySetup.mockRestore();
    }

    const reopened = await openExistingEncryptedDatabase(
      databasePath,
      legacyPassword,
    );
    try {
      expect(
        reopened.database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'financial_items'",
          )
          .pluck()
          .get(),
      ).toBe('financial_items');
    } finally {
      reopened.close();
    }
  });

  it('does not modify the database or sidecar when the password is wrong', async () => {
    const databasePath = createDatabasePath();
    const connection = await openOrCreateEncryptedDatabase(
      databasePath,
      TEST_PASSWORD,
    );
    connection.close();
    const metadataPath = `${databasePath}.metadata.json`;
    const databaseBefore = snapshot(databasePath);
    const metadataBefore = snapshot(metadataPath);

    await expect(
      openExistingEncryptedDatabase(
        databasePath,
        WRONG_TEST_PASSWORD,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.wrongPassword,
    });

    expect(snapshot(databasePath)).toEqual(databaseBefore);
    expect(snapshot(metadataPath)).toEqual(metadataBefore);
  });

  it('keeps known financial plaintext out of the database and journal files', async () => {
    const databasePath = createDatabasePath();
    const connection = await openOrCreateEncryptedDatabase(
      databasePath,
      TEST_PASSWORD,
    );
    const knownPlaintext = '示範銀行存款';

    try {
      connection.database
        .prepare(`
          INSERT INTO financial_items (
            id, name, direction, type, amount, status, updated_at,
            is_active, include_in_net_worth
          ) VALUES (?, ?, 'asset', 'bank_deposit', 1000, 'confirmed', ?, 1, 1)
        `)
        .run(
          'plaintext-probe',
          knownPlaintext,
          '2026-07-29T00:00:00.000Z',
        );

      const files = encryptedDatabaseFiles(databasePath);
      expect(files).toContain(databasePath);
      expect(files).toContain(`${databasePath}-wal`);
      expect(files).toContain(`${databasePath}-shm`);

      const needle = Buffer.from(knownPlaintext, 'utf8');
      const leaks = files.filter((filePath) =>
        readFileSync(filePath).includes(needle),
      );
      expect(leaks).toEqual([]);
      expect(
        connection.database.pragma('cipher', { simple: true }),
      ).toBe('chacha20');
      expect(
        connection.database.pragma('hmac_check', { simple: true }),
      ).toBe('1');
      expect(
        connection.database.pragma('page_size', { simple: true }),
      ).toBe(4096);
    } finally {
      connection.close();
    }
  });

  it('reports an authenticated page failure as an unreadable database', async () => {
    const databasePath = createDatabasePath();
    const connection = await openOrCreateEncryptedDatabase(
      databasePath,
      TEST_PASSWORD,
    );
    connection.close();

    const encrypted = readFileSync(databasePath);
    encrypted[200] ^= 0xff;
    writeFileSync(databasePath, encrypted);

    await expect(
      openExistingEncryptedDatabase(databasePath, TEST_PASSWORD),
    ).rejects.toMatchObject({
      code: ERROR_CODES.databaseUnreadable,
    });
  });

  function createDatabasePath(): string {
    directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-encryption-test-'),
    );
    return path.join(directory, 'financehub.db');
  }
});

function snapshot(filePath: string): {
  readonly content: Buffer;
  readonly modifiedNanoseconds: bigint;
} {
  return {
    content: readFileSync(filePath),
    modifiedNanoseconds: statSync(filePath, {
      bigint: true,
    }).mtimeNs,
  };
}

function encryptedDatabaseFiles(databasePath: string): string[] {
  const directory = path.dirname(databasePath);
  const basename = path.basename(databasePath);
  return readdirSync(directory)
    .filter(
      (name) =>
        name === basename ||
        name === `${basename}-wal` ||
        name === `${basename}-shm` ||
        name.includes('journal'),
    )
    .map((name) => path.join(directory, name))
    .filter(existsSync);
}
