import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import type { ImportService } from '../../application/import-service';
import type { ImportFileSelection } from '../../shared/imports';
import { ERROR_CODES, FinanceHubError } from '../../shared/errors';

export interface SelectedPdfFile {
  readonly path: string;
  readonly content: Uint8Array;
}

export type PdfFileSelector = () => Promise<SelectedPdfFile | undefined>;

export class PdfImportSession {
  private pending:
    | { readonly token: string; readonly content: Uint8Array }
    | undefined;

  constructor(
    private readonly imports: ImportService,
    private readonly selectFile: PdfFileSelector,
    private readonly createToken: () => string = randomUUID,
  ) {}

  async selectStatementFile(): Promise<ImportFileSelection> {
    this.pending = undefined;
    const selected = await this.selectFile();
    if (!selected) return { status: 'cancelled' };
    const token = this.createToken();
    this.pending = { token, content: selected.content };
    return {
      status: 'selected',
      selectionToken: token,
      displayName: basename(selected.path),
    };
  }

  async parseSelectedStatement(
    selectionToken: unknown,
    pdfPassword: unknown,
    creditCardAccountId: unknown,
  ) {
    if (
      typeof selectionToken !== 'string' ||
      typeof pdfPassword !== 'string' ||
      typeof creditCardAccountId !== 'string' ||
      this.pending?.token !== selectionToken
    ) {
      throw new FinanceHubError(
        ERROR_CODES.importSelectionUnavailable,
        '選取的 PDF 已失效，請重新選擇檔案。',
      );
    }
    const content = this.pending.content;
    this.pending = undefined;
    return this.imports.createBatch({
      content,
      sourcePassword: pdfPassword || undefined,
      creditCardAccountId,
    });
  }
}
