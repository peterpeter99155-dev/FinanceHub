import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ERROR_CODES,
  FinanceHubError,
  errorCodeOf,
} from '../../src/shared/errors';
import { toIpcResult } from '../../src/shared/ipc-result';

describe('structured IPC errors', () => {
  it('serializes a stable error code and safe details', async () => {
    const result = await toIpcResult(() => {
      throw new FinanceHubError(
        ERROR_CODES.resourceInUse,
        'internal message',
        { usageCount: 2 },
      );
    });

    expect(result).toEqual({
      ok: false,
      code: ERROR_CODES.resourceInUse,
      details: { usageCount: 2 },
    });
    expect(result).not.toHaveProperty('message');
  });

  it('does not expose unexpected infrastructure errors', async () => {
    const result = await toIpcResult(() => {
      throw new Error('database implementation detail');
    });

    expect(result).toEqual({
      ok: false,
      code: ERROR_CODES.unknown,
    });
  });

  it('reads a code from a structured value without requiring Error', () => {
    expect(
      errorCodeOf({ code: ERROR_CODES.futureTransaction }),
    ).toBe(ERROR_CODES.futureTransaction);
  });

  it('keeps renderer error handling independent of messages and databases', () => {
    for (const file of ['App.tsx', 'TransactionsView.tsx']) {
      const source = readFileSync(
        path.resolve('src', 'renderer', file),
        'utf8',
      );

      expect(source).not.toMatch(/error\.message|message\.includes/);
      expect(source).not.toMatch(/UNIQUE constraint|SQLITE/i);
    }
  });
});
