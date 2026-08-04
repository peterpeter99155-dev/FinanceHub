import type {
  ImportBatchGraph,
  ImportRepository,
} from '../../application/ports/import-repository';
import type {
  FinancialTimePrecision,
  ImportBatch,
  ImportCandidate,
  ImportDecision,
  ImportTransactionKind,
  TransactionSourceLink,
  SourceObservation,
} from '../../domain/import';
import type { SqliteDatabase } from './sqlite-database';
import { ERROR_CODES, FinanceHubError } from '../../shared/errors';

interface BatchRow {
  id: string;
  source_type: string;
  source_file_digest: string;
  statement_month: string;
  credit_card_account_id: string;
  imported_at: string;
  parser_name: string;
  parser_version: string;
  statement_detail_total: number;
  parsed_detail_total: number;
}

interface CandidateRow {
  id: string;
  batch_id: string;
  observation_id: string;
  kind: ImportTransactionKind;
  amount: number;
  occurred_at: string;
  occurred_at_precision: FinancialTimePrecision;
  name: string;
  credit_card_account_id: string;
  category_id: string | null;
  decision: ImportDecision | null;
  transaction_id: string | null;
  updated_at: string;
}

interface ObservationRow {
  id: string;
  batch_id: string;
  observation_fingerprint: string;
  kind: ImportTransactionKind;
  amount: number;
  occurred_at: string;
  occurred_at_precision: FinancialTimePrecision;
  summary: string;
  page_number: number;
  anonymous_row_locator: string;
  warning_codes: string;
}

export class SqliteImportRepository implements ImportRepository {
  constructor(private readonly database: SqliteDatabase) {}

  runInTransaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      const result = operation();
      this.database.exec('COMMIT;');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  createBatchGraph(graph: ImportBatchGraph): void {
    try {
      this.database
        .prepare(`
        INSERT INTO import_batches (
          id, source_type, source_file_digest, statement_month,
          credit_card_account_id, imported_at, parser_name, parser_version,
          statement_detail_total, parsed_detail_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          graph.batch.id,
          graph.batch.sourceType,
          graph.batch.sourceFileDigest,
          graph.batch.statementMonth,
          graph.batch.creditCardAccountId,
          graph.batch.importedAt,
          graph.batch.parserName,
          graph.batch.parserVersion,
          graph.batch.statementDetailTotal,
          graph.batch.parsedDetailTotal,
        );
    } catch (error) {
      if (sqliteCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new FinanceHubError(
          ERROR_CODES.importDuplicateSource,
          'The source file was already imported.',
        );
      }
      throw error;
    }

    const insertObservation = this.database.prepare(`
      INSERT INTO source_observations (
        id, batch_id, observation_fingerprint, kind, amount, occurred_at,
        occurred_at_precision, summary, page_number,
        anonymous_row_locator, warning_codes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const observation of graph.observations) {
      insertObservation.run(
        observation.id,
        observation.batchId,
        observation.observationFingerprint,
        observation.kind,
        observation.amount,
        observation.occurredAt,
        observation.occurredAtPrecision,
        observation.summary,
        observation.pageNumber,
        observation.anonymousRowLocator,
        JSON.stringify(observation.warningCodes),
      );
    }

    const insertCandidate = this.database.prepare(`
      INSERT INTO import_candidates (
        id, batch_id, observation_id, kind, amount, occurred_at,
        occurred_at_precision, name, credit_card_account_id, category_id,
        decision, transaction_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const candidate of graph.candidates) {
      insertCandidate.run(...candidateParameters(candidate));
    }
  }

  findBatchById(id: string): ImportBatch | undefined {
    return this.findBatch('id', id);
  }

  findBatchBySourceFileDigest(digest: string): ImportBatch | undefined {
    return this.findBatch('source_file_digest', digest);
  }

  listCandidates(batchId: string): readonly ImportCandidate[] {
    const rows = this.database
      .prepare(`
        SELECT ${candidateColumns()}
        FROM import_candidates
        WHERE batch_id = ?
        ORDER BY id
      `)
      .all(batchId) as unknown as CandidateRow[];
    return rows.map(mapCandidate);
  }

  listObservations(batchId: string): readonly SourceObservation[] {
    const rows = this.database
      .prepare(`
        SELECT id, batch_id, observation_fingerprint, kind, amount,
               occurred_at, occurred_at_precision, summary, page_number,
               anonymous_row_locator, warning_codes
        FROM source_observations
        WHERE batch_id = ?
        ORDER BY id
      `)
      .all(batchId) as unknown as ObservationRow[];
    return rows.map(mapObservation);
  }

  findCandidateById(id: string): ImportCandidate | undefined {
    const row = this.database
      .prepare(`
        SELECT ${candidateColumns()}
        FROM import_candidates
        WHERE id = ?
      `)
      .get(id) as unknown as CandidateRow | undefined;
    return row ? mapCandidate(row) : undefined;
  }

  updateCandidate(candidate: ImportCandidate): void {
    const result = this.database
      .prepare(`
        UPDATE import_candidates
        SET kind = ?, amount = ?, occurred_at = ?,
            occurred_at_precision = ?, name = ?,
            credit_card_account_id = ?, category_id = ?, updated_at = ?
        WHERE id = ? AND decision IS NULL
      `)
      .run(
        candidate.kind,
        candidate.amount,
        candidate.occurredAt,
        candidate.occurredAtPrecision,
        candidate.name,
        candidate.creditCardAccountId,
        candidate.categoryId ?? null,
        candidate.updatedAt,
        candidate.id,
      );
    assertChanged(result.changes, candidate.id);
  }

  resolveCandidate(candidate: ImportCandidate): void {
    const result = this.database
      .prepare(`
        UPDATE import_candidates
        SET decision = ?, transaction_id = ?, updated_at = ?
        WHERE id = ? AND decision IS NULL
      `)
      .run(
        candidate.decision ?? null,
        candidate.transactionId ?? null,
        candidate.updatedAt,
        candidate.id,
      );
    assertChanged(result.changes, candidate.id);
  }

  createSourceLink(link: TransactionSourceLink): void {
    this.database
      .prepare(`
        INSERT INTO transaction_source_links (
          observation_id, transaction_id, linked_at
        ) VALUES (?, ?, ?)
      `)
      .run(link.observationId, link.transactionId, link.linkedAt);
  }

  private findBatch(
    field: 'id' | 'source_file_digest',
    value: string,
  ): ImportBatch | undefined {
    const row = this.database
      .prepare(`
        SELECT id, source_type, source_file_digest, statement_month,
               credit_card_account_id, imported_at, parser_name,
               parser_version, statement_detail_total, parsed_detail_total
        FROM import_batches
        WHERE ${field} = ?
      `)
      .get(value) as unknown as BatchRow | undefined;
    return row ? mapBatch(row) : undefined;
  }
}

function candidateParameters(candidate: ImportCandidate): unknown[] {
  return [
    candidate.id,
    candidate.batchId,
    candidate.observationId,
    candidate.kind,
    candidate.amount,
    candidate.occurredAt,
    candidate.occurredAtPrecision,
    candidate.name,
    candidate.creditCardAccountId,
    candidate.categoryId ?? null,
    candidate.decision ?? null,
    candidate.transactionId ?? null,
    candidate.updatedAt,
  ];
}

function candidateColumns(): string {
  return `id, batch_id, observation_id, kind, amount, occurred_at,
          occurred_at_precision, name, credit_card_account_id, category_id,
          decision, transaction_id, updated_at`;
}

function mapBatch(row: BatchRow): ImportBatch {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceFileDigest: row.source_file_digest,
    statementMonth: row.statement_month,
    creditCardAccountId: row.credit_card_account_id,
    importedAt: row.imported_at,
    parserName: row.parser_name,
    parserVersion: row.parser_version,
    statementDetailTotal: Number(row.statement_detail_total),
    parsedDetailTotal: Number(row.parsed_detail_total),
  };
}

function mapCandidate(row: CandidateRow): ImportCandidate {
  return {
    id: row.id,
    batchId: row.batch_id,
    observationId: row.observation_id,
    kind: row.kind,
    amount: Number(row.amount),
    occurredAt: row.occurred_at,
    occurredAtPrecision: row.occurred_at_precision,
    name: row.name,
    creditCardAccountId: row.credit_card_account_id,
    categoryId: row.category_id ?? undefined,
    decision: row.decision ?? undefined,
    transactionId: row.transaction_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

function mapObservation(row: ObservationRow): SourceObservation {
  const warningCodes = JSON.parse(row.warning_codes) as unknown;
  if (
    !Array.isArray(warningCodes) ||
    warningCodes.some((code) => typeof code !== 'string')
  ) {
    throw new Error('Stored source observation warnings are invalid.');
  }
  return {
    id: row.id,
    batchId: row.batch_id,
    observationFingerprint: row.observation_fingerprint,
    kind: row.kind,
    amount: Number(row.amount),
    occurredAt: row.occurred_at,
    occurredAtPrecision: row.occurred_at_precision,
    summary: row.summary,
    pageNumber: Number(row.page_number),
    anonymousRowLocator: row.anonymous_row_locator,
    warningCodes,
  };
}

function assertChanged(changes: string | number, id: string): void {
  if (Number(changes) !== 1) {
    throw new Error(`Import candidate "${id}" is unavailable.`);
  }
}

function sqliteCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}
