import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
