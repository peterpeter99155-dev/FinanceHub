import { describe, expect, it } from 'vitest';

import { ImportService } from '../../src/application/import-service';
import type { ImportParser } from '../../src/application/ports/import-parser';
import type {
  ImportBatchGraph,
  ImportRepository,
} from '../../src/application/ports/import-repository';
import type {
  ImportBatch,
  ImportCandidate,
  ParsedImportBatch,
  SourceObservation,
  TransactionSourceLink,
} from '../../src/domain/import';
import { createTwdAmount } from '../../src/domain/money';
import {
  InMemoryFinanceStore,
  categoryRepository,
  financialItemRepository,
  transactionRepository,
} from './in-memory-finance-store';

const NOW = '2026-08-04T08:00:00.000Z';

class MemoryImportRepository implements ImportRepository {
  readonly batches = new Map<string, ImportBatch>();
  readonly candidates = new Map<string, ImportCandidate>();
  readonly observations = new Map<string, SourceObservation>();
  readonly links = new Map<string, TransactionSourceLink>();
  failOnLinkNumber?: number;
  private linkCount = 0;

  constructor(private readonly finance: InMemoryFinanceStore) {}

  runInTransaction<T>(operation: () => T): T {
    const batches = new Map(this.batches);
    const candidates = new Map(this.candidates);
    const observations = new Map(this.observations);
    const links = new Map(this.links);
    const transactions = new Map(this.finance.transactions);
    const items = new Map(this.finance.items);
    try {
      return operation();
    } catch (error) {
      replaceMap(this.batches, batches);
      replaceMap(this.candidates, candidates);
      replaceMap(this.observations, observations);
      replaceMap(this.links, links);
      replaceMap(this.finance.transactions, transactions);
      replaceMap(this.finance.items, items);
      throw error;
    }
  }

  createBatchGraph(graph: ImportBatchGraph): void {
    this.batches.set(graph.batch.id, graph.batch);
    for (const candidate of graph.candidates) {
      this.candidates.set(candidate.id, candidate);
    }
    for (const observation of graph.observations) {
      this.observations.set(observation.id, observation);
    }
  }

  findBatchById(id: string) {
    return this.batches.get(id);
  }

  findBatchBySourceFileDigest(digest: string) {
    return [...this.batches.values()].find(
      ({ sourceFileDigest }) => sourceFileDigest === digest,
    );
  }
  listBatches() {
    return [...this.batches.values()].sort((left, right) =>
      right.importedAt.localeCompare(left.importedAt));
  }

  findObservationsByFingerprint(fingerprint: string) {
    return [...this.observations.values()].filter(
      (observation) =>
        observation.observationFingerprint === fingerprint,
    );
  }

  findSourceLinkByObservationId(observationId: string) {
    return this.links.get(observationId);
  }

  listCandidates(batchId: string) {
    return [...this.candidates.values()].filter(
      (candidate) => candidate.batchId === batchId,
    );
  }

  listObservations(batchId: string) {
    return [...this.observations.values()].filter(
      (observation) => observation.batchId === batchId,
    );
  }

  findCandidateById(id: string) {
    return this.candidates.get(id);
  }

  updateCandidate(candidate: ImportCandidate): void {
    this.candidates.set(candidate.id, candidate);
  }

  resolveCandidate(candidate: ImportCandidate): void {
    this.candidates.set(candidate.id, candidate);
  }

  createSourceLink(link: TransactionSourceLink): void {
    this.linkCount += 1;
    if (this.linkCount === this.failOnLinkNumber) {
      throw new Error('simulated source-link failure');
    }
    this.links.set(link.observationId, link);
  }
}

function parsedBatch(
  overrides: Partial<ParsedImportBatch> = {},
): ParsedImportBatch {
  return {
    sourceType: 'credit_card_statement_pdf',
    sourceFileDigest: 'a'.repeat(64),
    statementMonth: '2026-07',
    creditCardAccountId: 'card-1',
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
        summary: '虛構書店',
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
        warningCodes: ['SUMMARY_REVIEW'],
      },
    ],
    ...overrides,
  };
}

function setup(parsed = parsedBatch()) {
  const finance = new InMemoryFinanceStore();
  finance.items.set('card-1', {
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
  finance.categories.set('expense-uncategorized', {
    id: 'expense-uncategorized',
    kind: 'expense',
    name: '暫未分類',
    isBuiltIn: true,
    isActive: true,
  });
  const imports = new MemoryImportRepository(finance);
  const parser: ImportParser = { parse: async () => parsed };
  let sequence = 0;
  const service = new ImportService(
    parser,
    imports,
    transactionRepository(finance),
    financialItemRepository(finance),
    categoryRepository(finance),
    () => `generated-${++sequence}`,
    { now: () => NOW },
  );
  return { finance, imports, service };
}

describe('ImportService', () => {
  it('creates only pending candidates and leaves all formal finance data unchanged', async () => {
    const { finance, imports, service } = setup();
    const beforeCard = finance.items.get('card-1');

    const result = await service.createBatch({
      content: new Uint8Array([1, 2, 3]),
      sourcePassword: 'one-time-password',
      creditCardAccountId: 'card-1',
    });

    expect(result.batch).toMatchObject({
      statementDetailTotal: 70,
      parsedDetailTotal: 70,
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(({ decision }) => !decision)).toBe(true);
    expect(finance.transactions.size).toBe(0);
    expect(finance.items.get('card-1')).toEqual(beforeCard);
    expect(imports.links.size).toBe(0);
  });

  it('keeps an unresolved signed observation pending and rejects create_new until a kind is selected', async () => {
    const unresolved = {
      ...parsedBatch().observations[1],
      kind: undefined,
      amount: 30,
      statementEffect: -30,
      summary: '虛構回饋折抵',
      warningCodes: ['NEGATIVE_ITEM_REQUIRES_USER_CONFIRMATION'],
    };
    const { finance, service } = setup(parsedBatch({
      statementDetailTotal: -30,
      observations: [unresolved],
    }));
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });
    expect(created.candidates[0]).toMatchObject({
      kind: undefined,
      amount: 30,
    });

    expect(() => service.confirmCandidates(created.batch.id, [{
      candidateId: created.candidates[0].id,
      decision: 'create_new',
    }])).toThrow('待確認項目必須先指定交易類型與有效金額');
    expect(finance.transactions.size).toBe(0);
    expect(finance.items.get('card-1')).toMatchObject({ amount: 0 });

    expect(service.excludeBatch(created.batch.id).candidates[0])
      .toMatchObject({ decision: 'exclude', kind: undefined });
  });

  it('updates a pending candidate without creating a formal transaction', async () => {
    const { finance, service } = setup();
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });
    const candidate = created.candidates[0];

    const updated = service.updateCandidate(candidate.id, {
      kind: 'credit_card_purchase',
      amount: 125,
      occurredAt: '2026-07-12T04:00:00.000Z',
      occurredAtPrecision: 'date',
      name: '使用者修正摘要',
      creditCardAccountId: 'card-1',
      categoryId: 'expense-uncategorized',
    });

    expect(updated).toMatchObject({ amount: 125, name: '使用者修正摘要' });
    expect(finance.transactions.size).toBe(0);
    expect(finance.items.get('card-1')?.amount).toBe(0);
  });

  it('reopens an identical source without creating another batch', async () => {
    const { imports, service } = setup();
    const request = {
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    };
    const original = await service.createBatch(request);
    const reopened = await service.createBatch(request);

    expect(reopened).toMatchObject({
      batch: { id: original.batch.id },
      wasAlreadyImported: true,
    });
    expect(imports.batches.size).toBe(1);
    expect(imports.candidates.size).toBe(2);
    expect(service.listBatches()).toEqual([{
      batch: original.batch,
      candidateCount: 2,
      pendingCount: 2,
    }]);
  });

  it('reports an observation already linked from another source without auto-merging it', async () => {
    const { finance, imports, service } = setup();
    finance.transactions.set('prior-transaction', {
      id: 'prior-transaction', kind: 'credit_card_purchase',
      amount: createTwdAmount(100),
      occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date',
      destinationAccountId: 'card-1', categoryId: 'expense-uncategorized',
      name: '虛構書店', note: '', createdAt: NOW, updatedAt: NOW,
    });
    imports.observations.set('prior-observation', {
      ...parsedBatch().observations[0], id: 'prior-observation',
      batchId: 'prior-batch',
    });
    imports.links.set('prior-observation', {
      observationId: 'prior-observation',
      transactionId: 'prior-transaction', linkedAt: NOW,
    });

    const result = await service.createBatch({
      content: new Uint8Array([2]), creditCardAccountId: 'card-1',
    });

    expect(result.insights[0]).toMatchObject({
      duplicateObservationCount: 1,
      matches: [{
        reason: 'same_source_observation',
        transaction: { id: 'prior-transaction' },
      }],
    });
    expect(result.candidates[0].decision).toBeUndefined();
    expect(finance.transactions.size).toBe(1);
  });

  it('suggests one category from confirmed history without writing it to the candidate', async () => {
    const { finance, service } = setup();
    finance.categories.set('expense-food', {
      id: 'expense-food', kind: 'expense', name: '飲食',
      isBuiltIn: true, isActive: true,
    });
    finance.transactions.set('history-1', {
      id: 'history-1', kind: 'credit_card_purchase',
      amount: createTwdAmount(800),
      occurredAt: '2026-05-01T04:00:00.000Z', occurredAtPrecision: 'date',
      destinationAccountId: 'card-1', categoryId: 'expense-food',
      name: '虛構書店', note: '', createdAt: NOW, updatedAt: NOW,
    });

    const result = await service.createBatch({
      content: new Uint8Array([3]), creditCardAccountId: 'card-1',
    });

    expect(result.insights[0].categorySuggestion).toEqual({
      categoryId: 'expense-food', evidenceCount: 1,
    });
    expect(result.candidates[0].categoryId).toBeUndefined();
  });

  it('applies create, link and exclude decisions atomically without modifying a linked transaction', async () => {
    const thirdObservation = {
      ...parsedBatch().observations[0],
      observationFingerprint: '3'.repeat(64),
      amount: 20,
      statementEffect: 20,
      summary: '排除項目',
      anonymousRowLocator: 'page-2-row-3',
    };
    const { finance, imports, service } = setup(
      parsedBatch({
        statementDetailTotal: 90,
        observations: [...parsedBatch().observations, thirdObservation],
      }),
    );
    finance.transactions.set('manual-transaction', {
      id: 'manual-transaction',
      kind: 'credit_card_refund',
      amount: createTwdAmount(30),
      occurredAt: '2026-07-11T04:00:00.000Z',
      occurredAtPrecision: 'date',
      destinationAccountId: 'card-1',
      categoryId: 'expense-uncategorized',
      name: '既有手動退款',
      note: '',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const originalManual = finance.transactions.get('manual-transaction');
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    const result = service.confirmCandidates(created.batch.id, [
      { candidateId: created.candidates[0].id, decision: 'create_new' },
      {
        candidateId: created.candidates[1].id,
        decision: 'link_existing',
        existingTransactionId: 'manual-transaction',
      },
      { candidateId: created.candidates[2].id, decision: 'exclude' },
    ]);

    expect(result.candidates.map(({ decision }) => decision)).toEqual([
      'create_new',
      'link_existing',
      'exclude',
    ]);
    expect(finance.transactions.size).toBe(2);
    expect(finance.transactions.get('manual-transaction')).toEqual(
      originalManual,
    );
    expect(finance.items.get('card-1')?.amount).toBe(100);
    expect(imports.links.size).toBe(2);
  });

  it('rejects linking to a different card or transaction kind', async () => {
    const { finance, service } = setup();
    finance.transactions.set('wrong-link', {
      id: 'wrong-link', kind: 'credit_card_refund',
      amount: createTwdAmount(100),
      occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date',
      destinationAccountId: 'another-card', categoryId: 'expense-uncategorized',
      name: '不相符交易', note: '', createdAt: NOW, updatedAt: NOW,
    });
    const created = await service.createBatch({
      content: new Uint8Array([1]), creditCardAccountId: 'card-1',
    });

    expect(() => service.confirmCandidates(created.batch.id, [{
      candidateId: created.candidates[0].id,
      decision: 'link_existing', existingTransactionId: 'wrong-link',
    }])).toThrow('does not match the candidate card and kind');
    expect(created.candidates[0].decision).toBeUndefined();
  });

  it('rolls back formal transactions, balances, links and decisions when any step fails', async () => {
    const { finance, imports, service } = setup();
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });
    imports.failOnLinkNumber = 2;

    expect(() =>
      service.confirmCandidates(created.batch.id, [
        { candidateId: created.candidates[0].id, decision: 'create_new' },
        { candidateId: created.candidates[1].id, decision: 'create_new' },
      ]),
    ).toThrow('simulated source-link failure');

    expect(finance.transactions.size).toBe(0);
    expect(finance.items.get('card-1')).toMatchObject({
      amount: 0,
      overpaymentBalance: 0,
    });
    expect(imports.links.size).toBe(0);
    expect(
      imports.listCandidates(created.batch.id).every(({ decision }) => !decision),
    ).toBe(true);
  });

  it('blocks confirmation when the parsed total differs from the statement total', async () => {
    const { finance, service } = setup(
      parsedBatch({ statementDetailTotal: 999 }),
    );
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    expect(() =>
      service.confirmCandidates(created.batch.id, [
        { candidateId: created.candidates[0].id, decision: 'create_new' },
      ]),
    ).toThrow('does not match');
    expect(finance.transactions.size).toBe(0);
  });

  it('allows a mismatched batch to be excluded without creating finance data', async () => {
    const { finance, service } = setup(
      parsedBatch({ statementDetailTotal: 999 }),
    );
    const created = await service.createBatch({
      content: new Uint8Array([1]),
      creditCardAccountId: 'card-1',
    });

    const excluded = service.excludeBatch(created.batch.id);

    expect(excluded.candidates.map(({ decision }) => decision)).toEqual([
      'exclude',
      'exclude',
    ]);
    expect(finance.transactions.size).toBe(0);
  });
});

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}
