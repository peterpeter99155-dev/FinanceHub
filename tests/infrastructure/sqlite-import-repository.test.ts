import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImportService } from '../../src/application/import-service';
import type { ImportParser } from '../../src/application/ports/import-parser';
import type { ImportRepository } from '../../src/application/ports/import-repository';
import { createTwdAmount } from '../../src/domain/money';
import {
  type BootstrapDatabase,
  openBootstrapDatabase,
} from '../../src/infrastructure/database/bootstrap-database';
import { SqliteCategoryRepository } from '../../src/infrastructure/database/sqlite-category-repository';
import { SqliteFinancialItemRepository } from '../../src/infrastructure/database/sqlite-financial-item-repository';
import { SqliteImportRepository } from '../../src/infrastructure/database/sqlite-import-repository';
import { SqliteTransactionRepository } from '../../src/infrastructure/database/sqlite-transaction-repository';

const NOW = '2026-08-04T08:00:00.000Z';

describe('SqliteImportRepository', () => {
  let connection: BootstrapDatabase;
  let imports: SqliteImportRepository;
  let transactions: SqliteTransactionRepository;
  let items: SqliteFinancialItemRepository;
  let categories: SqliteCategoryRepository;

  beforeEach(() => {
    connection = openBootstrapDatabase(':memory:');
    imports = new SqliteImportRepository(connection.database);
    transactions = new SqliteTransactionRepository(connection.database);
    items = new SqliteFinancialItemRepository(connection.database);
    categories = new SqliteCategoryRepository(connection.database);
    items.create({
      id: 'card-1',
      name: '虛構信用卡',
      direction: 'liability',
      type: 'credit_card',
      amount: createTwdAmount(0),
      overpaymentBalance: createTwdAmount(0),
      status: 'confirmed',
      updatedAt: NOW,
      isActive: true,
      includeInNetWorth: true,
    });
  });

  afterEach(() => connection.close());

  it('stores only source-neutral metadata and keeps candidates outside formal transactions', async () => {
    const service = createService(imports);
    const snapshot = await service.createBatch({
      content: new Uint8Array([9, 8, 7]),
      sourcePassword: 'not-persisted',
      creditCardAccountId: 'card-1',
    });

    expect(imports.findBatchById(snapshot.batch.id)).toEqual(snapshot.batch);
    expect(imports.listBatches()).toEqual([snapshot.batch]);
    expect(imports.listCandidates(snapshot.batch.id)).toEqual(
      snapshot.candidates,
    );
    expect(imports.listObservations(snapshot.batch.id)).toEqual(
      snapshot.observations,
    );
    expect(connection.database.prepare('PRAGMA foreign_key_check').all())
      .toEqual([]);
    expect(transactions.listByMonth(2026, 7).totalCount).toBe(0);
    expect(items.findById('card-1')).toMatchObject({
      amount: 0,
      overpaymentBalance: 0,
    });

    const tableSql = connection.database
      .prepare(`
        SELECT group_concat(sql, ' ') AS sql
        FROM sqlite_master
        WHERE name IN (
          'import_batches', 'source_observations',
          'import_candidates', 'transaction_source_links'
        )
      `)
      .get() as { sql: string };
    expect(tableSql.sql).not.toMatch(
      /password|file_path|file_name|pdf_content|raw_text/i,
    );
  });

  it('creates formal transactions and source links in one real SQLite transaction', async () => {
    const service = createService(imports);
    const snapshot = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    service.confirmCandidates(
      snapshot.batch.id,
      snapshot.candidates.map(({ id }) => ({
        candidateId: id,
        decision: 'create_new' as const,
      })),
    );

    expect(transactions.listByMonth(2026, 7).totalCount).toBe(2);
    expect(items.findById('card-1')).toMatchObject({
      amount: 70,
      overpaymentBalance: 0,
    });
    expect(
      connection.database
        .prepare('SELECT COUNT(*) AS count FROM transaction_source_links')
        .get(),
    ).toEqual({ count: 2 });
    const firstObservation = snapshot.observations[0];
    expect(
      imports.findObservationsByFingerprint(
        firstObservation.observationFingerprint,
      ),
    ).toEqual([firstObservation]);
    expect(
      imports.findSourceLinkByObservationId(firstObservation.id),
    ).toMatchObject({ observationId: firstObservation.id });
  });

  it('enforces create_new kind and amount requirements in SQLite', async () => {
    const service = createService(imports);
    const snapshot = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });
    const candidateId = snapshot.candidates[0].id;
    connection.database.prepare(`
      UPDATE import_candidates SET kind = NULL, amount = 0 WHERE id = ?
    `).run(candidateId);

    expect(() => connection.database.prepare(`
      UPDATE import_candidates SET decision = 'create_new' WHERE id = ?
    `).run(candidateId)).toThrow(/CHECK constraint failed/i);
    expect(connection.database.prepare(`
      SELECT decision FROM import_candidates WHERE id = ?
    `).get(candidateId)).toEqual({ decision: null });
  });

  it('deletes an import batch and its pending graph as one cascade', async () => {
    const service = createService(imports);
    const snapshot = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    service.removeBatch(snapshot.batch.id);

    expect(imports.findBatchById(snapshot.batch.id)).toBeUndefined();
    expect(imports.listCandidates(snapshot.batch.id)).toEqual([]);
    expect(imports.listObservations(snapshot.batch.id)).toEqual([]);
  });

  it('rolls back balances, transactions, links and decisions after a persistence failure', async () => {
    let links = 0;
    const failingImports: ImportRepository = {
      ...imports,
      runInTransaction: imports.runInTransaction.bind(imports),
      createBatchGraph: imports.createBatchGraph.bind(imports),
      findBatchById: imports.findBatchById.bind(imports),
      findBatchBySourceFileDigest:
        imports.findBatchBySourceFileDigest.bind(imports),
      listBatches: imports.listBatches.bind(imports),
      findObservationsByFingerprint:
        imports.findObservationsByFingerprint.bind(imports),
      findSourceLinkByObservationId:
        imports.findSourceLinkByObservationId.bind(imports),
      listCandidates: imports.listCandidates.bind(imports),
      listObservations: imports.listObservations.bind(imports),
      findCandidateById: imports.findCandidateById.bind(imports),
      updateCandidate: imports.updateCandidate.bind(imports),
      resolveCandidate: imports.resolveCandidate.bind(imports),
      deleteBatch: imports.deleteBatch.bind(imports),
      createSourceLink: (link) => {
        links += 1;
        if (links === 2) throw new Error('simulated SQLite link failure');
        imports.createSourceLink(link);
      },
    };
    const service = createService(failingImports);
    const snapshot = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    expect(() =>
      service.confirmCandidates(
        snapshot.batch.id,
        snapshot.candidates.map(({ id }) => ({
          candidateId: id,
          decision: 'create_new' as const,
        })),
      ),
    ).toThrow('simulated SQLite link failure');

    expect(transactions.listByMonth(2026, 7).totalCount).toBe(0);
    expect(items.findById('card-1')).toMatchObject({
      amount: 0,
      overpaymentBalance: 0,
    });
    expect(imports.listCandidates(snapshot.batch.id)).toEqual(
      snapshot.candidates,
    );
    expect(
      connection.database
        .prepare('SELECT COUNT(*) AS count FROM transaction_source_links')
        .get(),
    ).toEqual({ count: 0 });
  });

  function createService(importRepository: ImportRepository) {
    const parser: ImportParser = {
      parse: async (request) => ({
        sourceType: 'credit_card_statement_pdf',
        sourceFileDigest: 'b'.repeat(64),
        statementMonth: '2026-07',
        creditCardAccountId: request.creditCardAccountId,
        parserName: 'fictional-parser',
        parserVersion: '1.0.0',
        statementDetailTotal: 70,
        observations: [
          {
            observationFingerprint: '1'.repeat(64),
            kind: 'credit_card_purchase',
            amount: 100,
            statementEffect: 100,
            occurredAt: '2026-07-10T04:00:00.000Z',
            occurredAtPrecision: 'date',
            summary: '虛構消費',
            pageNumber: 2,
            anonymousRowLocator: 'page-2-row-1',
            warningCodes: [],
          },
          {
            observationFingerprint: '2'.repeat(64),
            kind: 'credit_card_refund',
            amount: 30,
            statementEffect: -30,
            occurredAt: '2026-07-11T04:00:00.000Z',
            occurredAtPrecision: 'date',
            summary: '虛構退款',
            pageNumber: 2,
            anonymousRowLocator: 'page-2-row-2',
            warningCodes: [],
          },
        ],
      }),
    };
    let sequence = 0;
    return new ImportService(
      parser,
      importRepository,
      transactions,
      items,
      categories,
      () => `sqlite-generated-${++sequence}`,
      { now: () => NOW },
    );
  }
});
