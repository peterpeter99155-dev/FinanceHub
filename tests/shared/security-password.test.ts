import { describe, expect, it } from 'vitest';

import {
  filterNewPasswordInput,
  isValidNewPassword,
} from '../../src/shared/security-password';

describe('new password policy', () => {
  it('accepts printable ASCII combinations with at least eight characters', () => {
    expect(isValidNewPassword('abcdefgh')).toBe(true);
    expect(isValidNewPassword('12345678')).toBe(true);
    expect(isValidNewPassword('!@#$%^&*')).toBe(true);
    expect(isValidNewPassword('Abc123!@')).toBe(true);
    expect(isValidNewPassword('a'.repeat(64))).toBe(true);
  });

  it('rejects short, Unicode, full-width, whitespace and newline input', () => {
    expect(isValidNewPassword('Abc123!')).toBe(false);
    expect(isValidNewPassword('中文Abc123!')).toBe(false);
    expect(isValidNewPassword('Ａbc123!')).toBe(false);
    expect(isValidNewPassword('Abc 123!')).toBe(false);
    expect(isValidNewPassword('Abc123!\n')).toBe(false);
    expect(isValidNewPassword('a'.repeat(65))).toBe(false);
  });

  it('removes disallowed pasted characters instead of storing them', () => {
    expect(filterNewPasswordInput('中文 Abc123! 密碼')).toBe(
      'Abc123!',
    );
    expect(filterNewPasswordInput('a'.repeat(65))).toBe(
      'a'.repeat(64),
    );
  });
});
