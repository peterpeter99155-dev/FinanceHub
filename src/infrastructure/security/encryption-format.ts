export const CURRENT_FORMAT_VERSION = 1;
export const CURRENT_KDF_VERSION = 1;

export interface EncryptionFormat {
  readonly formatVersion: number;
  readonly kdfVersion: number;
  readonly scrypt: {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly keyLength: number;
    readonly maxmem: number;
  };
  readonly saltLength: number;
  readonly password: {
    readonly minimumScalars: number;
    readonly maximumScalars: number;
    readonly maximumUtf8Bytes: number;
    readonly normalization: 'NFC';
  };
  readonly cipher: {
    readonly name: 'chacha20';
    readonly legacy: 0;
    readonly plaintextHeaderSize: 0;
    readonly hmacCheck: 1;
    readonly pageSize: 4096;
  };
}

const FORMAT_V1: EncryptionFormat = Object.freeze({
  formatVersion: 1,
  kdfVersion: 1,
  scrypt: Object.freeze({
    N: 262_144,
    r: 8,
    p: 1,
    keyLength: 32,
    maxmem: 512 * 1024 * 1024,
  }),
  saltLength: 32,
  password: Object.freeze({
    minimumScalars: 8,
    maximumScalars: 1024,
    maximumUtf8Bytes: 4096,
    normalization: 'NFC',
  }),
  cipher: Object.freeze({
    name: 'chacha20',
    legacy: 0,
    plaintextHeaderSize: 0,
    hmacCheck: 1,
    pageSize: 4096,
  }),
});

export function encryptionFormatFor(
  formatVersion: number,
  kdfVersion: number,
): EncryptionFormat | undefined {
  if (formatVersion === 1 && kdfVersion === 1) {
    return FORMAT_V1;
  }

  return undefined;
}

export function currentEncryptionFormat(): EncryptionFormat {
  return FORMAT_V1;
}
