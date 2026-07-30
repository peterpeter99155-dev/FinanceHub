export const NEW_PASSWORD_MINIMUM_LENGTH = 8;
export const NEW_PASSWORD_MAXIMUM_LENGTH = 64;

const PRINTABLE_ASCII_PATTERN = /^[\x21-\x7e]*$/;
const NON_PRINTABLE_ASCII_PATTERN = /[^\x21-\x7e]/g;

export function isValidNewPassword(password: string): boolean {
  return (
    password.length >= NEW_PASSWORD_MINIMUM_LENGTH &&
    password.length <= NEW_PASSWORD_MAXIMUM_LENGTH &&
    PRINTABLE_ASCII_PATTERN.test(password)
  );
}

export function filterNewPasswordInput(value: string): string {
  return value
    .replace(NON_PRINTABLE_ASCII_PATTERN, '')
    .slice(0, NEW_PASSWORD_MAXIMUM_LENGTH);
}
