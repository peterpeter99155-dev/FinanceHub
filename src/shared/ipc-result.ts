import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorDetails,
  FinanceHubError,
} from './errors';

export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ErrorCode;
      readonly details?: ErrorDetails;
    };

export async function toIpcResult<T>(
  operation: () => T | Promise<T>,
): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    if (error instanceof FinanceHubError) {
      return {
        ok: false,
        code: error.code,
        details: error.details,
      };
    }

    return { ok: false, code: ERROR_CODES.unknown };
  }
}
