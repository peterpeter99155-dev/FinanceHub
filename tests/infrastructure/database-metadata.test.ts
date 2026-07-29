import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  databasePaths,
  inspectDatabaseFiles,
  readEncryptionMetadata,
} from '../../src/infrastructure/security/database-metadata';
import { ERROR_CODES } from '../../src/shared/errors';

describe('encrypted database file-state safety', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it('rejects a database whose sidecar is missing without overwriting it', async () => {
    const paths = createPaths();
    const original = Buffer.from('existing-financial-database');
    writeFileSync(paths.databasePath, original);

    await expect(inspectDatabaseFiles(paths)).rejects.toMatchObject({
      code: ERROR_CODES.databaseMetadataMissing,
    });
    expect(readFileSync(paths.databasePath)).toEqual(original);
  });

  it('rejects a sidecar whose database is missing', async () => {
    const paths = createPaths();
    writeFileSync(paths.metadataPath, '{}');

    await expect(inspectDatabaseFiles(paths)).rejects.toMatchObject({
      code: ERROR_CODES.databaseFileMissing,
    });
  });

  it('recognizes files left by an interrupted first-time setup', async () => {
    const paths = createPaths();
    writeFileSync(paths.databaseCreatingPath, 'partial');

    await expect(inspectDatabaseFiles(paths)).rejects.toMatchObject({
      code: ERROR_CODES.databaseSetupIncomplete,
    });
  });

  it('rejects a sidecar format newer than the application supports', async () => {
    const paths = createPaths();
    writeFileSync(paths.databasePath, 'encrypted');
    writeFileSync(
      paths.metadataPath,
      JSON.stringify({
        formatVersion: 2,
        kdfVersion: 1,
        salt: {
          encoding: 'base64',
          value: Buffer.alloc(32).toString('base64'),
        },
        keyVerifier: {
          version: 1,
          algorithm: 'HMAC-SHA-256',
          encoding: 'base64',
          value: Buffer.alloc(32).toString('base64'),
        },
      }),
    );

    await expect(inspectDatabaseFiles(paths)).resolves.toBe('ready');
    await expect(
      readEncryptionMetadata(paths.metadataPath),
    ).rejects.toMatchObject({
      code: ERROR_CODES.unsupportedEncryptionFormat,
    });
  });

  function createPaths() {
    directory = mkdtempSync(
      path.join(tmpdir(), 'financehub-metadata-test-'),
    );
    return databasePaths(path.join(directory, 'financehub.db'));
  }
});
