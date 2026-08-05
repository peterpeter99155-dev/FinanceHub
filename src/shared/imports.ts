import type {
  CandidateDecision,
  ImportCandidate,
} from '../domain/import';
import type {
  ImportBatchSnapshot,
  ImportBatchHistoryItem,
  ImportCandidateUpdate,
} from '../application/import-service';

export type ImportFileSelection =
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'selected';
      readonly selectionToken: string;
      readonly displayName: string;
    };

export interface ImportsApi {
  selectStatementFile(): Promise<ImportFileSelection>;
  parseSelectedStatement(
    selectionToken: string,
    pdfPassword: string,
    creditCardAccountId: string,
  ): Promise<ImportBatchSnapshot>;
  getBatch(id: string): Promise<ImportBatchSnapshot>;
  listBatches(): Promise<readonly ImportBatchHistoryItem[]>;
  updateCandidate(
    id: string,
    update: ImportCandidateUpdate,
  ): Promise<ImportCandidate>;
  confirmCandidates(
    batchId: string,
    decisions: readonly CandidateDecision[],
  ): Promise<ImportBatchSnapshot>;
  excludeBatch(batchId: string): Promise<ImportBatchSnapshot>;
}
