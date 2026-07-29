export const ERROR_CODES = {
  unknown: 'UNKNOWN',
  invalidInput: 'INVALID_INPUT',
  amountMustBePositive: 'AMOUNT_MUST_BE_POSITIVE',
  amountOutOfRange: 'AMOUNT_OUT_OF_RANGE',
  duplicateName: 'DUPLICATE_NAME',
  builtInImmutable: 'BUILT_IN_IMMUTABLE',
  resourceInUse: 'RESOURCE_IN_USE',
  futureTransaction: 'FUTURE_TRANSACTION',
  negativeAccountBalance: 'NEGATIVE_ACCOUNT_BALANCE',
  invalidCategory: 'INVALID_CATEGORY',
  invalidAccount: 'INVALID_ACCOUNT',
} as const;

export type ErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDetails {
  readonly [key: string]: string | number | boolean | undefined;
}

export class FinanceHubError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'FinanceHubError';
  }
}

export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof FinanceHubError) {
    return error.code;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    Object.values(ERROR_CODES).some((code) => code === error.code)
  ) {
    return error.code as ErrorCode;
  }
  return ERROR_CODES.unknown;
}
