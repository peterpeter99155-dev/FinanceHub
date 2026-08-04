import { randomUUID } from 'node:crypto';

import type { CategoryRepository } from './ports/category-repository';
import type { Clock } from './ports/clock';
import { systemClock } from './ports/clock';
import type { FinancialItemRepository } from './ports/financial-item-repository';
import type { ImportParser, ImportParseRequest } from './ports/import-parser';
import type { ImportRepository } from './ports/import-repository';
import type { TransactionRepository } from './ports/transaction-repository';
import { applyTransactionEffects } from './transaction-balance-updater';
import { toTransactionAccount } from '../domain/financial-item';
import {
  type CandidateDecision,
  type FinancialTimePrecision,
  type ImportBatch,
  type ImportCandidate,
  type ImportTransactionKind,
  type ParsedImportBatch,
  type SourceObservation,
  calculateStatementDetailTotal,
} from '../domain/import';
import { createTwdAmount } from '../domain/money';
import {
  MAX_TRANSACTION_AMOUNT_TWD,
  MAX_TRANSACTION_NAME_LENGTH,
  type FinancialTransaction,
  calculateAccountBalanceEffects,
  createTransactionValidationOptions,
} from '../domain/transaction';
import { financialMonthFromDateTime } from '../domain/financial-time';
import {
  type CategorySuggestion,
  matchingTransactionIds,
  suggestImportCategory,
} from '../domain/import-suggestions';
import { ERROR_CODES, FinanceHubError } from '../shared/errors';

const UNCATEGORIZED_EXPENSE_ID = 'expense-uncategorized';

export interface ImportBatchSnapshot {
  readonly batch: ImportBatch;
  readonly observations: readonly SourceObservation[];
  readonly candidates: readonly ImportCandidate[];
  readonly insights: readonly ImportCandidateInsight[];
}

export interface ImportCandidateInsight {
  readonly candidateId: string;
  readonly duplicateObservationCount: number;
  readonly matches: readonly ImportTransactionMatch[];
  readonly categorySuggestion?: CategorySuggestion;
}

export interface ImportTransactionMatch {
  readonly transaction: FinancialTransaction;
  readonly reason:
    | 'same_source_observation'
    | 'matching_transaction_fields';
}

export interface ImportCandidateUpdate {
  readonly kind: ImportTransactionKind;
  readonly amount: number;
  readonly occurredAt: string;
  readonly occurredAtPrecision: FinancialTimePrecision;
  readonly name: string;
  readonly creditCardAccountId: string;
  readonly categoryId?: string;
}

export class ImportService {
  constructor(
    private readonly parser: ImportParser,
    private readonly imports: ImportRepository,
    private readonly transactions: TransactionRepository,
    private readonly financialItems: FinancialItemRepository,
    private readonly categories: CategoryRepository,
    private readonly createId: () => string = randomUUID,
    private readonly clock: Clock = systemClock,
  ) {}

  async createBatch(
    request: ImportParseRequest,
  ): Promise<ImportBatchSnapshot> {
    this.requireCreditCard(request.creditCardAccountId);
    const parsed = await this.parser.parse(request);
    this.validateParsedBatch(parsed, request.creditCardAccountId);
    if (
      this.imports.findBatchBySourceFileDigest(parsed.sourceFileDigest)
    ) {
      throw new FinanceHubError(
        ERROR_CODES.importDuplicateSource,
        'The source file was already imported.',
      );
    }

    const importedAt = this.clock.now();
    const batchId = this.createId();
    const observations: SourceObservation[] = [];
    const candidates: ImportCandidate[] = [];
    for (const parsedObservation of parsed.observations) {
      const observation: SourceObservation = {
        ...parsedObservation,
        id: this.createId(),
        batchId,
      };
      observations.push(observation);
      candidates.push({
        id: this.createId(),
        batchId,
        observationId: observation.id,
        kind: observation.kind,
        amount: observation.amount,
        occurredAt: observation.occurredAt,
        occurredAtPrecision: observation.occurredAtPrecision,
        name: observation.summary.slice(0, MAX_TRANSACTION_NAME_LENGTH),
        creditCardAccountId: parsed.creditCardAccountId,
        updatedAt: importedAt,
      });
    }
    const batch: ImportBatch = {
      id: batchId,
      sourceType: parsed.sourceType,
      sourceFileDigest: parsed.sourceFileDigest,
      statementMonth: parsed.statementMonth,
      creditCardAccountId: parsed.creditCardAccountId,
      importedAt,
      parserName: parsed.parserName,
      parserVersion: parsed.parserVersion,
      statementDetailTotal: parsed.statementDetailTotal,
      parsedDetailTotal: calculateStatementDetailTotal(
        parsed.observations,
      ),
    };

    this.imports.runInTransaction(() => {
      this.imports.createBatchGraph({ batch, observations, candidates });
    });
    return this.getBatch(batch.id);
  }

  getBatch(id: string): ImportBatchSnapshot {
    const batch = this.imports.findBatchById(id);
    if (!batch) throw new Error(`Import batch "${id}" was not found.`);
    const observations = this.imports.listObservations(id);
    const candidates = this.imports.listCandidates(id);
    const transactions = this.transactions.listAll();
    return {
      batch,
      observations,
      candidates,
      insights: candidates.map((candidate) =>
        this.buildInsight(
          candidate,
          observations.find(
            ({ id: observationId }) =>
              observationId === candidate.observationId,
          )!,
          transactions,
        ),
      ),
    };
  }

  private buildInsight(
    candidate: ImportCandidate,
    observation: SourceObservation,
    transactions: readonly FinancialTransaction[],
  ): ImportCandidateInsight {
    const previousObservations =
      this.imports
        .findObservationsByFingerprint(
          observation.observationFingerprint,
        )
        .filter(({ batchId }) => batchId !== candidate.batchId);
    const matches = new Map<string, ImportTransactionMatch>();
    for (const previous of previousObservations) {
      const link = this.imports.findSourceLinkByObservationId(previous.id);
      const transaction = link
        ? this.transactions.findById(link.transactionId)
        : undefined;
      if (transaction) {
        matches.set(transaction.id, {
          transaction,
          reason: 'same_source_observation',
        });
      }
    }
    for (const transactionId of matchingTransactionIds(
      candidate,
      transactions,
    )) {
      if (!matches.has(transactionId)) {
        const transaction = this.transactions.findById(transactionId);
        if (!transaction) continue;
        matches.set(transactionId, {
          transaction,
          reason: 'matching_transaction_fields',
        });
      }
    }
    const categorySuggestion = suggestImportCategory(
      candidate,
      transactions,
    );
    const suggestedCategory = categorySuggestion
      ? this.categories.findById(categorySuggestion.categoryId)
      : undefined;
    return {
      candidateId: candidate.id,
      duplicateObservationCount: previousObservations.length,
      matches: [...matches.values()],
      categorySuggestion:
        suggestedCategory?.isActive && suggestedCategory.kind === 'expense'
          ? categorySuggestion
          : undefined,
    };
  }

  updateCandidate(
    id: string,
    update: ImportCandidateUpdate,
  ): ImportCandidate {
    const existing = this.requirePendingCandidate(id);
    this.validateCandidateUpdate(update);
    const candidate: ImportCandidate = {
      ...existing,
      ...update,
      categoryId: update.categoryId,
      updatedAt: this.clock.now(),
    };
    this.imports.updateCandidate(candidate);
    return candidate;
  }

  confirmCandidates(
    batchId: string,
    decisions: readonly CandidateDecision[],
  ): ImportBatchSnapshot {
    const batch = this.requireReconciledBatch(batchId);
    assertUniqueCandidateDecisions(decisions);
    const now = this.clock.now();

    this.imports.runInTransaction(() => {
      for (const decision of decisions) {
        const candidate = this.requirePendingCandidate(
          decision.candidateId,
        );
        if (candidate.batchId !== batchId) {
          throw new FinanceHubError(
            ERROR_CODES.importCandidateUnavailable,
            'Import candidate belongs to another batch.',
          );
        }
        this.applyDecision(candidate, decision, now);
      }
    });
    return this.getBatch(batch.id);
  }

  excludeBatch(batchId: string): ImportBatchSnapshot {
    const batch = this.imports.findBatchById(batchId);
    if (!batch) throw new Error(`Import batch "${batchId}" was not found.`);
    const now = this.clock.now();
    this.imports.runInTransaction(() => {
      for (const candidate of this.imports.listCandidates(batchId)) {
        if (candidate.decision === undefined) {
          this.imports.resolveCandidate({
            ...candidate,
            decision: 'exclude',
            updatedAt: now,
          });
        }
      }
    });
    return this.getBatch(batch.id);
  }

  private applyDecision(
    candidate: ImportCandidate,
    decision: CandidateDecision,
    now: string,
  ): void {
    if (decision.decision === 'exclude') {
      this.imports.resolveCandidate({
        ...candidate,
        decision: 'exclude',
        updatedAt: now,
      });
      return;
    }

    const transactionId =
      decision.decision === 'create_new'
        ? this.createTransaction(
          this.requireCreatableCandidate(candidate),
          now,
        )
        : this.requireExistingTransactionId(candidate, decision);
    this.imports.createSourceLink({
      observationId: candidate.observationId,
      transactionId,
      linkedAt: now,
    });
    this.imports.resolveCandidate({
      ...candidate,
      decision: decision.decision,
      transactionId,
      updatedAt: now,
    });
  }

  private createTransaction(
    candidate: ImportCandidate & { readonly kind: ImportTransactionKind },
    now: string,
  ): string {
    const categoryId = candidate.categoryId ?? UNCATEGORIZED_EXPENSE_ID;
    const category = this.categories.findById(categoryId);
    if (!category) {
      throw new FinanceHubError(
        ERROR_CODES.invalidCategory,
        'Import candidate category was not found.',
      );
    }
    const transaction: FinancialTransaction = {
      id: this.createId(),
      kind: candidate.kind,
      amount: createTwdAmount(candidate.amount),
      occurredAt: candidate.occurredAt,
      occurredAtPrecision: candidate.occurredAtPrecision,
      destinationAccountId: candidate.creditCardAccountId,
      categoryId,
      name: candidate.name,
      note: '',
      createdAt: now,
      updatedAt: now,
    };
    const account = toTransactionAccount(
      this.requireCreditCard(candidate.creditCardAccountId),
    );
    const effects = calculateAccountBalanceEffects(
      transaction,
      createTransactionValidationOptions(
        now,
        account ? [account] : [],
        [category],
      ),
    );
    applyTransactionEffects(this.financialItems, effects, now);
    this.transactions.create(
      transaction,
      financialMonthFromDateTime(transaction.occurredAt),
    );
    return transaction.id;
  }

  private requireCreatableCandidate(
    candidate: ImportCandidate,
  ): ImportCandidate & { readonly kind: ImportTransactionKind } {
    if (!candidate.kind || candidate.amount <= 0) {
      throw new FinanceHubError(
        ERROR_CODES.importCandidateUnavailable,
        '待確認項目必須先指定交易類型與有效金額。',
      );
    }
    return candidate as ImportCandidate & {
      readonly kind: ImportTransactionKind;
    };
  }

  private requireExistingTransactionId(
    candidate: ImportCandidate,
    decision: CandidateDecision,
  ): string {
    const id = decision.existingTransactionId;
    const transaction = id ? this.transactions.findById(id) : undefined;
    if (
      !transaction ||
      !candidate.kind ||
      transaction.kind !== candidate.kind ||
      transaction.destinationAccountId !== candidate.creditCardAccountId
    ) {
      throw new FinanceHubError(
        ERROR_CODES.importCandidateUnavailable,
        'The selected transaction does not match the candidate card and kind.',
      );
    }
    return transaction.id;
  }

  private requirePendingCandidate(id: string): ImportCandidate {
    const candidate = this.imports.findCandidateById(id);
    if (!candidate || candidate.decision !== undefined) {
      throw new FinanceHubError(
        ERROR_CODES.importCandidateUnavailable,
        'Import candidate is unavailable.',
      );
    }
    return candidate;
  }

  private requireReconciledBatch(id: string): ImportBatch {
    const batch = this.imports.findBatchById(id);
    if (!batch) throw new Error(`Import batch "${id}" was not found.`);
    if (batch.statementDetailTotal !== batch.parsedDetailTotal) {
      throw new FinanceHubError(
        ERROR_CODES.importReconciliationMismatch,
        'Statement detail total does not match parsed observations.',
      );
    }
    return batch;
  }

  private requireCreditCard(id: string) {
    const item = this.financialItems.findById(id);
    if (!item || !item.isActive || item.type !== 'credit_card') {
      throw new FinanceHubError(
        ERROR_CODES.invalidAccount,
        'Import requires an active credit card.',
      );
    }
    return item;
  }

  private validateParsedBatch(
    parsed: ParsedImportBatch,
    requestedAccountId: string,
  ): void {
    if (parsed.creditCardAccountId !== requestedAccountId) {
      throw new FinanceHubError(
        ERROR_CODES.invalidAccount,
        'Parser returned a different credit card account.',
      );
    }
    const month = Number(parsed.statementMonth.slice(5));
    if (!/^\d{4}-\d{2}$/.test(parsed.statementMonth) || month < 1 || month > 12) {
      throw new Error('Parsed statement month is invalid.');
    }
    if (
      !/^[a-f0-9]{32,128}$/i.test(parsed.sourceFileDigest) ||
      !/^[a-z0-9._-]{1,100}$/i.test(parsed.sourceType) ||
      !/^[a-z0-9._-]{1,100}$/i.test(parsed.parserName) ||
      !/^[a-z0-9._-]{1,40}$/i.test(parsed.parserVersion) ||
      !Number.isSafeInteger(parsed.statementDetailTotal)
    ) {
      throw new Error('Parsed import metadata is incomplete.');
    }
    for (const observation of parsed.observations) {
      if (
        !/^[a-f0-9]{32,128}$/i.test(
          observation.observationFingerprint,
        ) ||
        !/^[a-z0-9._:-]{1,100}$/i.test(
          observation.anonymousRowLocator,
        ) ||
        !Number.isSafeInteger(observation.pageNumber) ||
        observation.pageNumber < 1 ||
        observation.warningCodes.some(
          (code) => !/^[A-Z0-9_]{1,64}$/.test(code),
        ) ||
        !Number.isSafeInteger(observation.statementEffect) ||
        observation.amount !== Math.abs(observation.statementEffect)
      ) {
        throw new Error('Parsed observation metadata is invalid.');
      }
      if (observation.kind) {
        this.validateCandidateUpdate({
          ...observation,
          kind: observation.kind,
          name: observation.summary,
          creditCardAccountId: parsed.creditCardAccountId,
        });
      } else if (
        observation.amount < 0 ||
        observation.amount > MAX_TRANSACTION_AMOUNT_TWD ||
        Number.isNaN(Date.parse(observation.occurredAt))
      ) {
        throw new Error('Unresolved parsed observation is invalid.');
      }
    }
  }

  private validateCandidateUpdate(update: ImportCandidateUpdate): void {
    if (
      !Number.isSafeInteger(update.amount) ||
      update.amount <= 0 ||
      update.amount > MAX_TRANSACTION_AMOUNT_TWD
    ) {
      throw new FinanceHubError(
        ERROR_CODES.amountOutOfRange,
        'Import candidate amount is invalid.',
      );
    }
    if (
      Number.isNaN(Date.parse(update.occurredAt)) ||
      Date.parse(update.occurredAt) > Date.parse(this.clock.now())
    ) {
      throw new FinanceHubError(
        ERROR_CODES.futureTransaction,
        'Import candidate date is invalid.',
      );
    }
    if (update.name.trim().length > MAX_TRANSACTION_NAME_LENGTH) {
      throw new Error('Import candidate name is too long.');
    }
    this.requireCreditCard(update.creditCardAccountId);
    if (update.categoryId && !this.categories.findById(update.categoryId)) {
      throw new FinanceHubError(
        ERROR_CODES.invalidCategory,
        'Import candidate category was not found.',
      );
    }
  }
}

function assertUniqueCandidateDecisions(
  decisions: readonly CandidateDecision[],
): void {
  const ids = new Set(decisions.map(({ candidateId }) => candidateId));
  if (ids.size !== decisions.length) {
    throw new Error('Import candidate decisions contain duplicate ids.');
  }
}
