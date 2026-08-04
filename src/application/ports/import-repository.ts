import type {
  ImportBatch,
  ImportCandidate,
  SourceObservation,
  TransactionSourceLink,
} from '../../domain/import';

export interface ImportBatchGraph {
  readonly batch: ImportBatch;
  readonly observations: readonly SourceObservation[];
  readonly candidates: readonly ImportCandidate[];
}

export interface ImportRepository {
  runInTransaction<T>(operation: () => T): T;
  createBatchGraph(graph: ImportBatchGraph): void;
  findBatchById(id: string): ImportBatch | undefined;
  findBatchBySourceFileDigest(digest: string): ImportBatch | undefined;
  listCandidates(batchId: string): readonly ImportCandidate[];
  listObservations(batchId: string): readonly SourceObservation[];
  findCandidateById(id: string): ImportCandidate | undefined;
  updateCandidate(candidate: ImportCandidate): void;
  resolveCandidate(candidate: ImportCandidate): void;
  createSourceLink(link: TransactionSourceLink): void;
}
