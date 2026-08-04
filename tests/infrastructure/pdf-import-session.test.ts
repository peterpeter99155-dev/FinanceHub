import { describe, expect, it, vi } from 'vitest';

import type { ImportService } from '../../src/application/import-service';
import { PdfImportSession } from '../../src/infrastructure/pdf/pdf-import-session';

describe('PdfImportSession', () => {
  it('returns only an opaque token and display name, then consumes bytes and PDF password once', async () => {
    const createBatch = vi.fn(async () => ({
      batch: {}, observations: [], candidates: [],
    }));
    const session = new PdfImportSession(
      { createBatch } as unknown as ImportService,
      async () => ({
        path: 'C:\\private\\account-statement.pdf',
        content: new Uint8Array([1, 2, 3]),
      }),
      () => 'opaque-selection-token',
    );

    await expect(session.selectStatementFile()).resolves.toEqual({
      status: 'selected',
      selectionToken: 'opaque-selection-token',
      displayName: 'account-statement.pdf',
    });
    await session.parseSelectedStatement(
      'opaque-selection-token',
      'one-time-pdf-password',
      'card-1',
    );
    expect(createBatch).toHaveBeenCalledWith({
      content: new Uint8Array([1, 2, 3]),
      sourcePassword: 'one-time-pdf-password',
      creditCardAccountId: 'card-1',
    });
    await expect(session.parseSelectedStatement(
      'opaque-selection-token',
      'one-time-pdf-password',
      'card-1',
    )).rejects.toMatchObject({ code: 'IMPORT_SELECTION_UNAVAILABLE' });
  });

  it('replaces prior selections and never returns a local path', async () => {
    const session = new PdfImportSession(
      {} as ImportService,
      async () => ({
        path: 'D:\\sensitive\\fictional.pdf',
        content: new Uint8Array([4]),
      }),
      () => 'token-2',
    );
    const result = await session.selectStatementFile();
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('D:');
  });
});
