import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  openExistingEncryptedDatabase,
  openOrCreateEncryptedDatabase,
} from '../../src/infrastructure/database/encrypted-database';
import { EncryptedBackupService } from '../../src/infrastructure/backup/encrypted-backup-service';
import { validateBackupDirectory } from '../../src/infrastructure/backup/backup-format';
import { DatabaseWriteGate } from '../../src/infrastructure/main/database-write-gate';
import { errorCodeOf, ERROR_CODES } from '../../src/shared/errors';
import { toIpcResult } from '../../src/shared/ipc-result';

const PASSWORD = 'S4-Backup-Test-Password!';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('EncryptedBackupService', () => {
  it('backs up latest WAL data, publishes a valid manifest and restores in isolation', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const backups = path.join(root, 'backups');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    connection.database.prepare(`
      INSERT INTO financial_items (
        id, name, direction, type, amount, status, updated_at,
        is_active, include_in_net_worth
      ) VALUES (?, ?, 'asset', 'bank_deposit', ?, 'confirmed', ?, 1, 1)
    `).run('asset-backup', '備份測試銀行', 50000, new Date().toISOString());
    connection.database.prepare(`
      INSERT INTO financial_items (
        id, name, direction, type, amount, status, updated_at,
        is_active, include_in_net_worth
      ) VALUES (?, ?, 'liability', 'loan', ?, 'confirmed', ?, 1, 1)
    `).run('liability-backup', '備份測試負債', 12000, new Date().toISOString());
    connection.database.prepare(`
      INSERT INTO financial_transactions (
        id, kind, amount, occurred_at, financial_month, source_account_id,
        destination_account_id, category_id, name, note, created_at, updated_at
      ) VALUES (?, 'income', ?, ?, '2026-07', NULL, ?, 'income-salary', ?, '', ?, ?)
    `).run(
      'transaction-backup',
      3000,
      '2026-07-30T00:00:00.000Z',
      'asset-backup',
      '備份測試薪資',
      '2026-07-30T00:00:00.000Z',
      '2026-07-30T00:00:00.000Z',
    );
    expect(existsSync(`${databasePath}-wal`)).toBe(true);
    expect(statSync(`${databasePath}-wal`).size).toBeGreaterThan(0);

    const service = new EncryptedBackupService(
      connection.database,
      databasePath,
      backups,
      '0.1.0-test',
      new DatabaseWriteGate(),
    );
    const manifest = await service.createBackup();
    const directory = path.join(backups, `backup-${manifest.backupId}`);
    expect(await validateBackupDirectory(directory)).toEqual(manifest);
    expect(manifest.databaseSchemaVersion).toBe(6);
    expect(manifest.encryption).toEqual({ formatVersion: 1, kdfVersion: 1 });

    const restored = await openExistingEncryptedDatabase(
      path.join(directory, 'financehub.db'),
      PASSWORD,
    );
    expect(restored.database.prepare(
      'SELECT name, amount FROM financial_items WHERE id = ?',
    ).get('asset-backup')).toEqual({ name: '備份測試銀行', amount: 50000 });
    expect(restored.database.prepare(
      'SELECT name, amount FROM financial_transactions WHERE id = ?',
    ).get('transaction-backup')).toEqual({
      name: '備份測試薪資',
      amount: 3000,
    });
    expect(restored.database.prepare(`
      SELECT
        SUM(CASE WHEN direction = 'asset' THEN amount ELSE 0 END) -
        SUM(CASE WHEN direction = 'liability' THEN amount ELSE 0 END) AS netWorth
      FROM financial_items
      WHERE include_in_net_worth = 1
    `).get()).toEqual({ netWorth: 38000 });
    restored.close();
    connection.close();

    const bytes = readFileSync(path.join(directory, 'financehub.db'));
    expect(bytes.includes(Buffer.from('備份測試銀行', 'utf8'))).toBe(false);
    expect(bytes.includes(Buffer.from('備份測試薪資', 'utf8'))).toBe(false);
    expect(() => {
      const ordinary = new DatabaseSync(path.join(directory, 'financehub.db'), {
        readOnly: true,
      });
      try {
        ordinary.prepare('SELECT * FROM sqlite_master').all();
      } finally {
        ordinary.close();
      }
    }).toThrow(/file is not a database/i);
  });

  it('fails before copying when a reader keeps checkpoint busy', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const writer = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const reader = await openExistingEncryptedDatabase(databasePath, PASSWORD);
    reader.database.exec('BEGIN');
    reader.database.prepare('SELECT * FROM financial_items').all();
    writer.database.prepare(`
      INSERT INTO financial_items (
        id, name, direction, type, amount, status, updated_at,
        is_active, include_in_net_worth
      ) VALUES ('busy', 'busy', 'asset', 'cash', 1, 'confirmed', ?, 1, 1)
    `).run(new Date().toISOString());
    const backups = path.join(root, 'backups');
    const service = new EncryptedBackupService(
      writer.database, databasePath, backups, 'test', new DatabaseWriteGate(),
    );
    await expect(service.createBackup()).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupCheckpointBusy,
    );
    expect(existsSync(backups) ? readdirSync(backups) : []).toEqual([]);
    reader.database.exec('COMMIT');
    reader.close();
    writer.close();
  });

  it('does not treat missing sidecar as a backup and preserves the database', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    rmSync(`${databasePath}.metadata.json`);
    const before = readFileSync(databasePath);
    const service = new EncryptedBackupService(
      connection.database, databasePath, path.join(root, 'backups'),
      'test', new DatabaseWriteGate(),
    );
    await expect(service.createBackup()).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupSourceInvalid,
    );
    expect(readFileSync(databasePath)).toEqual(before);
    connection.close();
  });

  it('removes only owned incomplete directories and rejects unknown contents or junctions', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backups = path.join(root, 'backups');
    mkdirSync(backups);
    const removable = path.join(backups, '.creating-11111111-1111-4111-8111-111111111111');
    mkdirSync(removable);
    writeFileSync(path.join(removable, 'financehub.db'), 'partial');
    const unknown = path.join(backups, '.creating-22222222-2222-4222-8222-222222222222');
    mkdirSync(unknown);
    writeFileSync(path.join(unknown, 'unknown.txt'), 'keep');
    const target = path.join(root, 'outside');
    mkdirSync(target);
    const junction = path.join(backups, '.creating-33333333-3333-4333-8333-333333333333');
    symlinkSync(target, junction, 'junction');

    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test', new DatabaseWriteGate(),
    );
    await service.cleanupIncompleteBackups();
    expect(existsSync(removable)).toBe(false);
    expect(existsSync(unknown)).toBe(true);
    expect(existsSync(junction)).toBe(true);
    expect(existsSync(target)).toBe(true);
    connection.close();
  });

  it('does not publish a backup when copied metadata validation fails', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    writeFileSync(`${databasePath}.metadata.json`, '{}');
    const backups = path.join(root, 'backups');
    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test', new DatabaseWriteGate(),
    );
    await expect(service.createBackup()).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.invalidDatabaseMetadata,
    );
    expect(readdirSync(backups)).toEqual([]);
    connection.close();
  });

  it('maps an unusable destination to a stable error without changing source data', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const before = readFileSync(databasePath);
    const unusableRoot = path.join(root, 'not-a-directory');
    writeFileSync(unusableRoot, 'occupied');
    const service = new EncryptedBackupService(
      connection.database, databasePath, unusableRoot, 'test',
      new DatabaseWriteGate(),
    );
    expect(await toIpcResult(() => service.createBackup())).toEqual({
      ok: false,
      code: ERROR_CODES.backupIoFailure,
    });
    expect(readFileSync(databasePath)).toEqual(before);
    connection.close();
  });

  it('does not overwrite an existing backup when backupId collides', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backupId = '44444444-4444-4444-8444-444444444444';
    const service = new EncryptedBackupService(
      connection.database, databasePath, path.join(root, 'backups'), 'test',
      new DatabaseWriteGate(), () => new Date('2026-07-30T00:00:00.000Z'),
      () => backupId,
    );
    const first = await service.createBackup();
    const firstDirectory = path.join(root, 'backups', `backup-${backupId}`);
    const firstManifest = readFileSync(path.join(firstDirectory, 'manifest.json'));
    await expect(service.createBackup()).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupIoFailure,
    );
    expect(readFileSync(path.join(firstDirectory, 'manifest.json')))
      .toEqual(firstManifest);
    expect(first.backupId).toBe(backupId);
    connection.close();
  });

  it('rebuilds count and latest success only from fully validated directories', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backups = path.join(root, 'backups');
    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test',
      new DatabaseWriteGate(),
      () => new Date('2026-07-30T04:00:00.000Z'),
      () => '55555555-5555-4555-8555-555555555555',
    );
    await service.createBackup();
    const invalid = path.join(
      backups,
      'backup-66666666-6666-4666-8666-666666666666',
    );
    mkdirSync(invalid);
    writeFileSync(path.join(invalid, 'manifest.json'), '{}');
    await expect(service.inspectInventory()).resolves.toEqual({
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-30T04:00:00.000Z',
    });
    connection.database.exec(
      "UPDATE backup_settings SET next_automatic_backup_at = '2099-01-01T00:00:00.000Z'",
    );
    await expect(service.inspectInventory()).resolves.toEqual({
      validBackupCount: 1,
      lastSuccessfulAt: '2026-07-30T04:00:00.000Z',
    });
    connection.close();
  });

  it('keeps the newest seven validated backups and never follows unknown links', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backups = path.join(root, 'backups');
    const ids = Array.from({ length: 8 }, (_, index) =>
      `7000000${index}-0000-4000-8000-00000000000${index}`,
    );
    let idIndex = 0;
    let timestamp = Date.parse('2026-07-01T00:00:00.000Z');
    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test',
      new DatabaseWriteGate(),
      () => new Date(timestamp += 1000),
      () => ids[idIndex++],
    );
    for (let index = 0; index < 8; index += 1) {
      await service.createBackup();
    }
    const outside = path.join(root, 'outside-retention');
    mkdirSync(outside);
    const junction = path.join(
      backups,
      'backup-79999999-9999-4999-8999-999999999999',
    );
    symlinkSync(outside, junction, 'junction');
    const unknown = path.join(
      backups,
      'backup-78888888-8888-4888-8888-888888888888',
    );
    mkdirSync(unknown);
    writeFileSync(path.join(unknown, 'unknown.txt'), 'keep');

    await service.pruneBackups(7);

    expect(existsSync(path.join(backups, `backup-${ids[0]}`))).toBe(false);
    for (const id of ids.slice(1)) {
      expect(existsSync(path.join(backups, `backup-${id}`))).toBe(true);
    }
    expect(existsSync(junction)).toBe(true);
    expect(existsSync(outside)).toBe(true);
    expect(existsSync(unknown)).toBe(true);
    await expect(service.inspectInventory()).resolves.toMatchObject({
      validBackupCount: 7,
    });
    connection.close();
  });

  it('retains the new backup and reports cleanup failure when quarantine is blocked', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backups = path.join(root, 'backups');
    const ids = [
      '81111111-1111-4111-8111-111111111111',
      '82222222-2222-4222-8222-222222222222',
      '83333333-3333-4333-8333-333333333333',
      '84444444-4444-4444-8444-444444444444',
    ];
    let idIndex = 0;
    let timestamp = Date.parse('2026-07-01T00:00:00.000Z');
    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test',
      new DatabaseWriteGate(),
      () => new Date(timestamp += 1000),
      () => ids[idIndex++],
    );
    for (let index = 0; index < ids.length; index += 1) {
      await service.createBackup();
    }
    mkdirSync(path.join(backups, `.deleting-${ids[0]}`));

    await expect(service.pruneBackups(3)).rejects.toMatchObject({
      code: ERROR_CODES.backupCleanupFailure,
    });
    for (const id of ids) {
      expect(existsSync(path.join(backups, `backup-${id}`))).toBe(true);
    }
    connection.close();
  });

  it('retains a valid replacement when cleanup identity changes before rename', async () => {
    const root = temporaryRoot();
    const databasePath = path.join(root, 'financehub.db');
    const connection = await openOrCreateEncryptedDatabase(databasePath, PASSWORD);
    const backups = path.join(root, 'backups');
    const ids = [
      '91111111-1111-4111-8111-111111111111',
      '92222222-2222-4222-8222-222222222222',
      '93333333-3333-4333-8333-333333333333',
      '94444444-4444-4444-8444-444444444444',
    ];
    let idIndex = 0;
    let timestamp = Date.parse('2026-07-01T00:00:00.000Z');
    const moveWithReplacement = async (source: string, target: string) => {
      const heldOriginal = path.join(backups, 'held-original');
      const replacement = path.join(backups, `backup-${ids[3]}`);
      renameSync(source, heldOriginal);
      renameSync(replacement, source);
      renameSync(source, target);
    };
    const service = new EncryptedBackupService(
      connection.database, databasePath, backups, 'test',
      new DatabaseWriteGate(),
      () => new Date(timestamp += 1000),
      () => ids[idIndex++],
      moveWithReplacement,
    );
    for (let index = 0; index < ids.length; index += 1) {
      await service.createBackup();
    }

    await expect(service.pruneBackups(3)).rejects.toMatchObject({
      code: ERROR_CODES.backupCleanupFailure,
    });

    const heldOriginal = path.join(backups, 'held-original');
    const quarantine = path.join(backups, `.deleting-${ids[0]}`);
    expect(existsSync(heldOriginal)).toBe(true);
    expect(existsSync(quarantine)).toBe(true);
    expect(readdirSync(quarantine).sort()).toEqual([
      'financehub.db',
      'financehub.db.metadata.json',
      'manifest.json',
    ]);
    await expect(validateBackupDirectory(quarantine)).resolves.toMatchObject({
      backupId: ids[3],
    });
    connection.close();
  });
});

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'financehub-backup-test-'));
  roots.push(root);
  return root;
}
