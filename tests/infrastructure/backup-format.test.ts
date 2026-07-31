import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseBackupManifest,
  validateBackupDirectory,
} from '../../src/infrastructure/backup/backup-format';
import { errorCodeOf, ERROR_CODES } from '../../src/shared/errors';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('backup format v1', () => {
  it('rejects malformed identifiers, dates, versions and hashes', () => {
    for (const override of [
      { backupId: 'not-a-uuid' },
      { completedAt: 'not-a-date' },
      { databaseSchemaVersion: 0 },
      { database: { file: 'financehub.db', sizeBytes: 1, sha256: 'bad' } },
    ]) {
      expect(() => parseBackupManifest({ ...validManifest(), ...override }))
        .toThrow();
    }
  });

  it('detects a changed database after manifest creation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'financehub-format-test-'));
    roots.push(root);
    writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(validManifest()));
    writeFileSync(path.join(root, 'financehub.db'), 'changed');
    writeFileSync(path.join(root, 'financehub.db.metadata.json'), 'metadata');
    await expect(validateBackupDirectory(root)).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupFormatInvalid,
    );
  });

  it('rejects extra files and subdirectories', async () => {
    const root = validDirectory();
    writeFileSync(path.join(root, 'extra.txt'), 'extra');
    await expect(validateBackupDirectory(root)).rejects.toSatisfy(
      invalidFormat,
    );
    rmSync(path.join(root, 'extra.txt'));
    mkdirSync(path.join(root, 'nested'));
    await expect(validateBackupDirectory(root)).rejects.toSatisfy(
      invalidFormat,
    );
  });

  it.each([
    'financehub.db',
    'financehub.db.metadata.json',
    'manifest.json',
  ])('rejects a backup missing %s', async (file) => {
    const root = validDirectory();
    rmSync(path.join(root, file));
    await expect(validateBackupDirectory(root)).rejects.toSatisfy(
      invalidFormat,
    );
  });

  it('rejects a symlink or junction in place of an expected file', async () => {
    const root = validDirectory();
    const database = path.join(root, 'financehub.db');
    rmSync(database);
    if (process.platform === 'win32') {
      const outside = `${root}-outside-directory`;
      mkdirSync(outside);
      roots.push(outside);
      symlinkSync(outside, database, 'junction');
    } else {
      const outside = `${root}-outside.db`;
      writeFileSync(outside, 'database');
      roots.push(outside);
      symlinkSync(outside, database, 'file');
    }
    await expect(validateBackupDirectory(root)).rejects.toSatisfy(
      invalidFormat,
    );
  });

  it('rejects a junction in place of the backup directory', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'financehub-format-test-'));
    roots.push(root);
    const target = validDirectory();
    const junction = path.join(root, 'junction');
    symlinkSync(target, junction, 'junction');
    await expect(validateBackupDirectory(junction)).rejects.toSatisfy(
      invalidFormat,
    );
  });
});

function validManifest() {
  return {
    formatVersion: 1,
    backupId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-07-30T00:00:00.000Z',
    completedAt: '2026-07-30T00:00:01.000Z',
    applicationVersion: 'test',
    databaseSchemaVersion: 5,
    database: {
      file: 'financehub.db',
      sizeBytes: 1,
      sha256: '0'.repeat(64),
    },
    metadata: {
      file: 'financehub.db.metadata.json',
      sizeBytes: 1,
      sha256: '0'.repeat(64),
    },
    encryption: { formatVersion: 1, kdfVersion: 1 },
  };
}

function validDirectory(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'financehub-format-test-'));
  roots.push(root);
  const database = Buffer.from('database');
  const metadata = Buffer.from('metadata');
  writeFileSync(path.join(root, 'financehub.db'), database);
  writeFileSync(path.join(root, 'financehub.db.metadata.json'), metadata);
  const manifest = validManifest();
  manifest.database.sizeBytes = database.length;
  manifest.database.sha256 = createHash('sha256').update(database).digest('hex');
  manifest.metadata.sizeBytes = metadata.length;
  manifest.metadata.sha256 = createHash('sha256').update(metadata).digest('hex');
  writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  return root;
}

function invalidFormat(error: unknown): boolean {
  return errorCodeOf(error) === ERROR_CODES.backupFormatInvalid;
}
