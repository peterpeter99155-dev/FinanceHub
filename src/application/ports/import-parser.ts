import type { ParsedImportBatch } from '../../domain/import';

export interface ImportParseRequest {
  readonly content: Uint8Array;
  readonly sourcePassword?: string;
  readonly creditCardAccountId: string;
}

export interface ImportParser {
  parse(request: ImportParseRequest): Promise<ParsedImportBatch>;
}
