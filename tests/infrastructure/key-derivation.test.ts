import { describe, expect, it } from 'vitest';

import {
  currentEncryptionFormat,
} from '../../src/infrastructure/security/encryption-format';
import {
  deriveKeys,
} from '../../src/infrastructure/security/key-derivation';

const TEST_PASSWORD = 'S3 known vector password';

describe('encryption format v1 key derivation', () => {
  it('keeps the trusted parameters and known derived keys stable', async () => {
    const format = currentEncryptionFormat();
    expect(format).toMatchObject({
      formatVersion: 1,
      kdfVersion: 1,
      scrypt: {
        N: 262_144,
        r: 8,
        p: 1,
        keyLength: 32,
        maxmem: 536_870_912,
      },
      saltLength: 32,
      cipher: {
        name: 'chacha20',
        legacy: 0,
        plaintextHeaderSize: 0,
        hmacCheck: 1,
        pageSize: 4096,
      },
    });

    const salt = Buffer.from(
      Array.from({ length: 32 }, (_value, index) => index),
    );
    const keys = await deriveKeys(TEST_PASSWORD, salt, format);

    try {
      expect(keys.databaseKey.toString('hex')).toBe(
        'daff531a5fd5f62311f74c035a2a08296d9bfcfeed0e10f932c9bbc5a7c65dcb',
      );
      expect(keys.verifierKey.toString('hex')).toBe(
        '97a70cdae46927b8ee76f6050c34f942678e2087c46ccc815cf4f7708ac8c3a3',
      );
    } finally {
      keys.databaseKey.fill(0);
      keys.verifierKey.fill(0);
      salt.fill(0);
    }
  });

  it('normalizes equivalent Unicode passwords with NFC without trimming', async () => {
    const format = currentEncryptionFormat();
    const salt = Buffer.alloc(32, 0x5a);
    const composed = await deriveKeys(
      '密語é with spaces ',
      salt,
      format,
    );
    const decomposed = await deriveKeys(
      '密語e\u0301 with spaces ',
      salt,
      format,
    );
    const trimmed = await deriveKeys(
      '密語é with spaces',
      salt,
      format,
    );

    try {
      expect(decomposed.databaseKey).toEqual(composed.databaseKey);
      expect(trimmed.databaseKey).not.toEqual(composed.databaseKey);
    } finally {
      composed.databaseKey.fill(0);
      composed.verifierKey.fill(0);
      decomposed.databaseKey.fill(0);
      decomposed.verifierKey.fill(0);
      trimmed.databaseKey.fill(0);
      trimmed.verifierKey.fill(0);
      salt.fill(0);
    }
  });
});
