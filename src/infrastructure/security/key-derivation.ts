import {
  createHmac,
  hkdfSync,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

import { FinanceHubError, ERROR_CODES } from '../../shared/errors';
import type { EncryptionFormat } from './encryption-format';

const DATABASE_KEY_INFO = Buffer.from(
  'FinanceHub/database-key/v1',
  'utf8',
);
const VERIFIER_KEY_INFO = Buffer.from(
  'FinanceHub/key-verifier-key/v1',
  'utf8',
);
const VERIFIER_MESSAGE = Buffer.from(
  'FinanceHub/key-verifier/v1',
  'utf8',
);
const EMPTY_HKDF_SALT = Buffer.alloc(0);

export interface DerivedKeys {
  readonly databaseKey: Buffer;
  readonly verifierKey: Buffer;
}

export async function deriveKeys(
  password: string,
  salt: Buffer,
  format: EncryptionFormat,
): Promise<DerivedKeys> {
  const passwordBytes = normalizePassword(password, format);
  let masterKey: Buffer | undefined;

  try {
    masterKey = await scryptAsync(
      passwordBytes,
      salt,
      format,
    );
    return {
      databaseKey: Buffer.from(
        hkdfSync(
          'sha256',
          masterKey,
          EMPTY_HKDF_SALT,
          DATABASE_KEY_INFO,
          32,
        ),
      ),
      verifierKey: Buffer.from(
        hkdfSync(
          'sha256',
          masterKey,
          EMPTY_HKDF_SALT,
          VERIFIER_KEY_INFO,
          32,
        ),
      ),
    };
  } finally {
    passwordBytes.fill(0);
    masterKey?.fill(0);
  }
}

export function createKeyVerifier(verifierKey: Buffer): Buffer {
  return createHmac('sha256', verifierKey)
    .update(VERIFIER_MESSAGE)
    .digest();
}

export function keyVerifierMatches(
  expected: Buffer,
  actual: Buffer,
): boolean {
  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

function normalizePassword(
  password: string,
  format: EncryptionFormat,
): Buffer {
  if (typeof password !== 'string') {
    throw new FinanceHubError(
      ERROR_CODES.invalidPassword,
      '主密碼格式不正確。',
    );
  }

  const normalized = password.normalize(
    format.password.normalization,
  );
  const scalars = [...normalized];
  const containsUnpairedSurrogate = scalars.some((value) => {
    const codePoint = value.codePointAt(0);
    return (
      codePoint !== undefined &&
      codePoint >= 0xd800 &&
      codePoint <= 0xdfff
    );
  });

  if (
    containsUnpairedSurrogate ||
    scalars.length < format.password.minimumScalars ||
    scalars.length > format.password.maximumScalars
  ) {
    throw new FinanceHubError(
      ERROR_CODES.invalidPassword,
      '主密碼長度或字元格式不正確。',
    );
  }

  const encoded = Buffer.from(normalized, 'utf8');
  if (encoded.length > format.password.maximumUtf8Bytes) {
    encoded.fill(0);
    throw new FinanceHubError(
      ERROR_CODES.invalidPassword,
      '主密碼編碼後超過允許長度。',
    );
  }

  return encoded;
}

function scryptAsync(
  password: Buffer,
  salt: Buffer,
  format: EncryptionFormat,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      format.scrypt.keyLength,
      {
        N: format.scrypt.N,
        r: format.scrypt.r,
        p: format.scrypt.p,
        maxmem: format.scrypt.maxmem,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}
