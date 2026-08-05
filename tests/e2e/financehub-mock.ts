import type { FinancialCategory } from '../../src/domain/category';
import { systemClock } from '../../src/application/ports/clock';
import {
  FinancialItem,
  toTransactionAccount,
} from '../../src/domain/financial-item';
import type { FinancialItemCustomType } from '../../src/domain/financial-item-custom-type';
import { createTwdAmount } from '../../src/domain/money';
import type { FinancialTransaction } from '../../src/domain/transaction';
import type { ImportBatchSnapshot } from '../../src/application/import-service';
import {
  calculateReviewedStatementDetailTotal,
  type ImportCandidate,
  type SourceObservation,
} from '../../src/domain/import';
import {
  applyBalanceEffect,
  calculateAccountBalanceEffects,
  calculateMonthlyTransactionSummary,
  createTransactionValidationOptions,
  reverseBalanceEffect,
} from '../../src/domain/transaction';
import type { FinanceHubApi } from '../../src/shared/bootstrap';
import type { BackupStatus } from '../../src/shared/backups';
import type { FinancialItemDraft } from '../../src/shared/financial-items';
import { IMPORT_WARNING_CODES } from '../../src/shared/import-warning-codes';
import type {
  FinancialItemCustomTypeDraft,
} from '../../src/shared/management';
import type {
  TransactionDraft,
  TransactionMonthSnapshot,
} from '../../src/shared/transactions';

const NOW = '2026-07-28T09:00:00.000Z';
const BROWSER_TEST_PASSWORD = 'S3-Browser-Password!';

const BUILT_IN_CATEGORIES: readonly FinancialCategory[] = [
  category('income-salary', 'income', '薪資'),
  category('income-other', 'income', '其他'),
  category('expense-food', 'expense', '飲食'),
  category('expense-communication', 'expense', '通訊'),
  category('expense-other', 'expense', '其他'),
  category('expense-uncategorized', 'expense', '暫未分類'),
];

interface MutableState {
  items: FinancialItem[];
  categories: FinancialCategory[];
  customTypes: FinancialItemCustomType[];
  transactions: FinancialTransaction[];
  nextId: number;
}

export function installFinanceHubMock(): void {
  const requestedSecurityState = new URLSearchParams(
    window.location.search,
  ).get('security');
  let databaseState:
    | 'setup_required'
    | 'locked'
    | 'unlocked' =
    requestedSecurityState === 'setup'
      ? 'setup_required'
      : requestedSecurityState === 'locked'
        ? 'locked'
        : 'unlocked';
  const state: MutableState = {
    items: [
      financialItem('bank-1', '示範銀行', 'bank_deposit', 100_000),
      financialItem('cash-1', '現金', 'cash', 2_000),
    ],
    categories: [...BUILT_IN_CATEGORIES],
    customTypes: [],
    transactions: [],
    nextId: 1,
  };

  window.financeHub = createApi(state, {
    get: () => databaseState,
    unlock: (password) => {
      if (
        databaseState === 'locked' &&
        password !== BROWSER_TEST_PASSWORD
      ) {
        throw { code: 'WRONG_PASSWORD' };
      }
      databaseState = 'unlocked';
    },
  });
}

function createApi(
  state: MutableState,
  security: {
    get(): 'setup_required' | 'locked' | 'unlocked';
    unlock(password: string): void;
  },
): FinanceHubApi {
  const importScenario = new URLSearchParams(window.location.search).get('import');
  if (importScenario !== null) state.items.push(creditCardItem());
  let importSnapshot = createImportSnapshot();
  let importRemoved = false;
  if (importScenario === 'link') {
    const transaction = existingCardTransaction();
    state.transactions.push(transaction);
    importSnapshot = withFirstDuplicateInsight(importSnapshot, transaction);
  }
  if (importScenario === 'suggestions') {
    const transaction = existingCardTransaction();
    state.transactions.push(transaction);
    importSnapshot = withFirstDuplicateInsight(importSnapshot, transaction, true);
  }
  if (importScenario === 'partial-duplicate') {
    const transaction = existingCardTransaction();
    state.transactions.push(transaction);
    importSnapshot = withFirstDuplicateInsight({
      ...importSnapshot,
      candidates: importSnapshot.candidates.map((candidate, index) =>
        index === 1 ? { ...candidate, kind: 'credit_card_refund' } : candidate,
      ),
    }, transaction);
  }
  if (importScenario === 'observation-only-duplicate') {
    importSnapshot = {
      ...importSnapshot,
      insights: importSnapshot.insights.map((insight, index) =>
        index === 0
          ? { ...insight, duplicateObservationCount: 1 }
          : insight,
      ),
    };
  }
  if (importScenario === 'empty-candidates') {
    importSnapshot = { ...importSnapshot, candidates: [], insights: [] };
  }
  if (importScenario === 'reconciliation-mismatch') {
    importSnapshot = {
      ...importSnapshot,
      batch: { ...importSnapshot.batch, statementDetailTotal: 1_000 },
      reconciliationDifference: 100,
      isReconciled: false,
    };
  }
  let backupStatus: BackupStatus = {
    automaticEnabled: true,
    dataDirectory: 'C:\\FinanceHub-Test-Data',
    backupDirectory: 'C:\\FinanceHub-Test-Data\\backups',
    retentionCount: 7,
    isRunning: false,
    validBackupCount: 0,
  };
  const backupScenario = new URLSearchParams(window.location.search).get(
    'backup',
  );
  if (backupScenario === 'running') {
    backupStatus = { ...backupStatus, isRunning: true };
  }
  if (backupScenario === 'capacity') {
    backupStatus = {
      ...backupStatus,
      validBackupCount: 7,
      oldestSuccessfulAt: '2026-07-21T09:00:00.000Z',
      lastSuccessfulAt: NOW,
    };
  }
  if (backupScenario === 'retention-reduction') {
    backupStatus = {
      ...backupStatus,
      retentionCount: 30,
      validBackupCount: 4,
      oldestSuccessfulAt: '2026-07-21T09:00:00.000Z',
      lastSuccessfulAt: NOW,
    };
  }
  if (backupScenario === 'warnings') {
    backupStatus = {
      ...backupStatus,
      validBackupCount: 1,
      lastSuccessfulAt: NOW,
      lastError: {
        code: 'BACKUP_IO_FAILURE',
        message: '最近一次備份未完成。',
        occurredAt: '2026-07-28T10:00:00.000Z',
      },
      cleanupWarning: {
        code: 'BACKUP_CLEANUP_FAILURE',
        message: '新備份已建立，但無法清理部分舊備份。',
        occurredAt: '2026-07-28T10:00:00.000Z',
      },
      statusWarning: {
        code: 'BACKUP_STATUS_UPDATE_FAILURE',
        message: '備份檔已建立，但無法更新備份狀態紀錄。',
        occurredAt: '2026-07-28T10:00:00.000Z',
      },
    };
  }
  return {
    getBootstrapStatus: async () => ({
      appName: 'FinanceHub',
      databaseReady: security.get() === 'unlocked',
      databaseState: security.get(),
      databaseDirectory: 'C:\\FinanceHub-Test-Data',
      databaseFileName: 'financehub.db',
      metadataFileName: 'financehub.db.metadata.json',
      storagePolicy: 'sample-data-only',
    }),
    unlockDatabase: async (password) => security.unlock(password),
    backups: {
      getStatus: async () => backupStatus,
      waitForCurrentBackup: async () => {
        if (backupScenario === 'running') {
          await new Promise<void>((resolve) => {
            window.addEventListener(
              'financehub-test-backup-complete',
              () => resolve(),
              { once: true },
            );
          });
        }
        backupStatus = {
          ...backupStatus,
          isRunning: false,
          validBackupCount: Math.max(1, backupStatus.validBackupCount),
          lastSuccessfulAt: NOW,
        };
        return backupStatus;
      },
      createNow: async () => {
        if (backupScenario === 'failure') {
          throw { code: 'BACKUP_IO_FAILURE' };
        }
        backupStatus = {
          ...backupStatus,
          validBackupCount: backupScenario === 'capacity'
            ? backupStatus.validBackupCount
            : backupStatus.validBackupCount + 1,
          lastSuccessfulAt: NOW,
        };
        return backupStatus;
      },
      setAutomaticEnabled: async (enabled) => {
        backupStatus = { ...backupStatus, automaticEnabled: enabled };
        return backupStatus;
      },
      setRetentionCount: async (retentionCount, confirmRemoval = false) => {
        backupStatus = {
          ...backupStatus,
          retentionCount,
          validBackupCount:
            confirmRemoval && backupStatus.validBackupCount > retentionCount
              ? retentionCount
              : backupStatus.validBackupCount,
        };
        return backupStatus;
      },
      openDirectory: async () => undefined,
      exportLatest: async () => 'exported',
    },
    financialItems: {
      list: async () => financialItemSnapshot(state),
      create: async (draft) => {
        const id = `item-${state.nextId++}`;
        state.items.push(itemFromDraft(id, draft));
        return financialItemSnapshot(state);
      },
      update: async (id, draft) => {
        replaceItem(state, id, itemFromDraft(id, draft));
        return financialItemSnapshot(state);
      },
      delete: async (id) => {
        state.items = state.items.filter((item) => item.id !== id);
        return financialItemSnapshot(state);
      },
    },
    categories: {
      list: async () => [...state.categories],
      create: async (draft) => {
        state.categories.push(
          category(
            `category-${state.nextId++}`,
            draft.kind,
            draft.name.trim(),
            false,
            draft.isActive,
          ),
        );
        return [...state.categories];
      },
      update: async (id, draft) => {
        state.categories = state.categories.map((entry) =>
          entry.id === id
            ? { ...entry, ...draft, name: draft.name.trim() }
            : entry,
        );
        return [...state.categories];
      },
      delete: async (id) => {
        state.categories = state.categories.filter(
          (entry) => entry.id !== id,
        );
        return [...state.categories];
      },
      reassignAndDelete: async (id, replacementId) => {
        state.transactions = state.transactions.map((transaction) =>
          transaction.categoryId === id
            ? { ...transaction, categoryId: replacementId }
            : transaction,
        );
        state.categories = state.categories.filter(
          (entry) => entry.id !== id,
        );
        return [...state.categories];
      },
    },
    financialItemCustomTypes: {
      list: async () => [...state.customTypes],
      create: async (draft) => {
        state.customTypes.push(customTypeFromDraft(state, draft));
        return [...state.customTypes];
      },
      update: async (id, draft) => {
        state.customTypes = state.customTypes.map((entry) =>
          entry.id === id
            ? { ...entry, ...draft, name: draft.name.trim() }
            : entry,
        );
        return [...state.customTypes];
      },
      delete: async (id) => {
        state.customTypes = state.customTypes.filter(
          (entry) => entry.id !== id,
        );
        return [...state.customTypes];
      },
    },
    imports: {
      selectStatementFile: async () => ({ status: 'selected', selectionToken: 'selection-1', displayName: '虛構信用卡帳單.pdf' }),
      parseSelectedStatement: async () => {
        if (importScenario === 'parse-loading') {
          await new Promise<void>((resolve) => {
            window.addEventListener(
              'financehub-test-import-parse-ready',
              () => resolve(),
              { once: true },
            );
          });
        }
        if (importScenario === 'failure') throw { code: 'PDF_PARSE_INCOMPLETE' };
        if (importRemoved) {
          importSnapshot = createImportSnapshot();
          importRemoved = false;
        }
        return importScenario === 'duplicate'
          ? { ...importSnapshot, wasAlreadyImported: true }
          : importSnapshot;
      },
      getBatch: async () => {
        if (importScenario === 'history-open-error') {
          throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
        }
        return importSnapshot;
      },
      listBatches: async () => {
        if (importScenario === 'history-error') {
          throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
        }
        if (importScenario === 'history-empty' || importRemoved) return [];
        if (importScenario === 'history-loading') {
          await new Promise<void>((resolve) => {
            window.addEventListener(
              'financehub-test-import-history-ready',
              () => resolve(),
              { once: true },
            );
          });
        }
        return [{
        batch: importSnapshot.batch,
        candidateCount: importSnapshot.candidates.length,
        pendingCount: importSnapshot.candidates.filter(
          ({ decision }) => !decision,
        ).length,
        }];
      },
      updateCandidate: async (id, update) => {
        const current = importSnapshot.candidates.find((item) => item.id === id);
        if (!current) throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
        const updated = { ...current, ...update, updatedAt: NOW };
        const candidates = importSnapshot.candidates.map((item) => item.id === id ? updated : item);
        const reviewedDetailTotal = calculateReviewedStatementDetailTotal(
          candidates.map((candidate) => ({
            kind: candidate.kind,
            amount: candidate.amount,
            originalStatementEffect: importSnapshot.observations.find(
              ({ id: observationId }) => observationId === candidate.observationId,
            )!.statementEffect,
          })),
        );
        const reconciliationDifference = Math.abs(
          reviewedDetailTotal - importSnapshot.batch.statementDetailTotal,
        );
        importSnapshot = {
          ...importSnapshot,
          candidates,
          reviewedDetailTotal,
          reconciliationDifference,
          isReconciled: reconciliationDifference === 0,
        };
        return updated;
      },
      confirmCandidates: async (_batchId, decisions) => {
        if (importScenario === 'reconciliation-mismatch') {
          throw { code: 'IMPORT_RECONCILIATION_MISMATCH' };
        }
        if (importScenario === 'confirm-failure') throw { code: 'IMPORT_CANDIDATE_UNAVAILABLE' };
        for (const decision of decisions) {
          if (decision.decision !== 'create_new') continue;
          const candidate = importSnapshot.candidates.find(
            ({ id }) => id === decision.candidateId,
          );
          if (!candidate?.kind) continue;
          state.transactions.push({
            id: `created-${candidate.id}`,
            kind: candidate.kind,
            amount: createTwdAmount(candidate.amount),
            occurredAt: candidate.occurredAt,
            occurredAtPrecision: candidate.occurredAtPrecision,
            destinationAccountId: candidate.creditCardAccountId,
            categoryId: candidate.categoryId ?? 'expense-uncategorized',
            name: candidate.name,
            note: '',
            createdAt: NOW,
            updatedAt: NOW,
          });
        }
        importSnapshot = { ...importSnapshot, candidates: importSnapshot.candidates.map((item) => {
          const decision = decisions.find((entry) => entry.candidateId === item.id);
          return decision ? { ...item, decision: decision.decision, transactionId: decision.existingTransactionId ?? `created-${item.id}`, updatedAt: NOW } : item;
        }) };
        return importSnapshot;
      },
      excludeBatch: async () => importSnapshot,
      removeBatch: async () => {
        importRemoved = true;
      },
    },
    transactions: {
      listMonth: async (year, month, offset = 0) =>
        transactionSnapshot(state, year, month, offset),
      create: async (draft, year, month) => {
        validateTransactionDraft(draft);
        const transaction = transactionFromDraft(
          state,
          `transaction-${state.nextId++}`,
          draft,
        );
        applyTransactionEffects(state, transaction);
        state.transactions.push(transaction);
        return transactionSnapshot(state, year, month);
      },
      update: async (id, draft, year, month) => {
        validateTransactionDraft(draft);
        const previous = findTransaction(state, id);
        applyTransactionEffects(state, previous, true);
        const replacement = transactionFromDraft(state, id, draft);
        applyTransactionEffects(state, replacement);
        state.transactions = state.transactions.map((transaction) =>
          transaction.id === id ? replacement : transaction,
        );
        return transactionSnapshot(state, year, month);
      },
      delete: async (id, year, month) => {
        const previous = findTransaction(state, id);
        applyTransactionEffects(state, previous, true);
        state.transactions = state.transactions.filter(
          (transaction) => transaction.id !== id,
        );
        return transactionSnapshot(state, year, month);
      },
    },
  };
}

function withFirstDuplicateInsight(
  snapshot: ImportBatchSnapshot,
  transaction: FinancialTransaction,
  includeCategorySuggestion = false,
): ImportBatchSnapshot {
  return {
    ...snapshot,
    insights: snapshot.insights.map((insight, index) =>
      index === 0
        ? {
            ...insight,
            duplicateObservationCount: 1,
            matches: [{ transaction, reason: 'matching_transaction_fields' }],
            categorySuggestion: includeCategorySuggestion
              ? { categoryId: 'expense-food', evidenceCount: 2 }
              : undefined,
          }
        : insight,
    ),
  };
}

function financialItemSnapshot(state: MutableState) {
  const totalAssets = state.items
    .filter(
      (item) =>
        item.direction === 'asset' &&
        item.isActive &&
        item.includeInNetWorth,
    )
    .reduce((total, item) => total + item.amount, 0);
  const totalLiabilities = state.items
    .filter(
      (item) =>
        item.direction === 'liability' &&
        item.isActive &&
        item.includeInNetWorth,
    )
    .reduce((total, item) => total + item.amount, 0);

  return {
    items: [...state.items],
    summary: {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    },
  };
}

function transactionSnapshot(
  state: MutableState,
  year: number,
  month: number,
  offset = 0,
): TransactionMonthSnapshot {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const allItems = state.transactions
    .filter((transaction) => transaction.occurredAt.startsWith(monthKey))
    .sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    );
  const summary = calculateMonthlyTransactionSummary(
    allItems,
    year,
    month,
  );

  return {
    year,
    month,
    items: allItems.slice(offset, offset + 50),
    totalCount: allItems.length,
    summary,
  };
}

function transactionFromDraft(
  state: MutableState,
  id: string,
  draft: TransactionDraft,
): FinancialTransaction {
  const timestamp = systemClock.now();
  const defaultName = state.categories.find(
    (entry) => entry.id === draft.categoryId,
  )?.name;

  return {
    id,
    ...draft,
    amount: createTwdAmount(draft.amount),
    occurredAtPrecision: draft.occurredAtPrecision ?? 'datetime',
    name: draft.name.trim() || defaultName || draft.kind,
    note: draft.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function validateTransactionDraft(draft: TransactionDraft): void {
  if (draft.amount <= 0 || draft.amount > 999_999_999_999) {
    throw new Error('Transaction amount is outside the allowed range.');
  }

  if (
    (draft.kind === 'income' || draft.kind === 'expense') &&
    !draft.categoryId
  ) {
    throw new Error('Transaction category is required.');
  }
}

function applyTransactionEffects(
  state: MutableState,
  transaction: FinancialTransaction,
  reverse = false,
): void {
  const effects = calculateAccountBalanceEffects(
    transaction,
    createTransactionValidationOptions(
      systemClock.now(),
      state.items.flatMap((item) => {
        const account = toTransactionAccount(item);
        return account ? [account] : [];
      }),
      state.categories,
    ),
  );

  for (const effect of effects) {
    const appliedEffect = reverse ? reverseBalanceEffect(effect) : effect;
    state.items = state.items.map((item) =>
      item.id === appliedEffect.accountId
        ? {
            ...item,
            amount: applyBalanceEffect(item.amount, appliedEffect),
          }
        : item,
    );
  }
}

function replaceItem(
  state: MutableState,
  id: string,
  replacement: FinancialItem,
): void {
  state.items = state.items.map((item) =>
    item.id === id ? replacement : item,
  );
}

function findTransaction(
  state: MutableState,
  id: string,
): FinancialTransaction {
  const transaction = state.transactions.find((entry) => entry.id === id);
  if (!transaction) {
    throw new Error('Transaction was not found.');
  }
  return transaction;
}

function itemFromDraft(
  id: string,
  draft: FinancialItemDraft,
): FinancialItem {
  return {
    id,
    ...draft,
    name: draft.name.trim() || draft.type,
    amount: createTwdAmount(draft.amount),
    overpaymentBalance: createTwdAmount(0),
    updatedAt: NOW,
    isActive: true,
  };
}

function customTypeFromDraft(
  state: MutableState,
  draft: FinancialItemCustomTypeDraft,
): FinancialItemCustomType {
  return {
    id: `custom-type-${state.nextId++}`,
    ...draft,
    name: draft.name.trim(),
  };
}

function category(
  id: string,
  kind: 'income' | 'expense',
  name: string,
  isBuiltIn = true,
  isActive = true,
): FinancialCategory {
  return { id, kind, name, isBuiltIn, isActive };
}

function financialItem(
  id: string,
  name: string,
  type: 'bank_deposit' | 'cash',
  amount: number,
): FinancialItem {
  return {
    id,
    name,
    direction: 'asset',
    type,
    amount: createTwdAmount(amount),
    overpaymentBalance: createTwdAmount(0),
    status: 'confirmed',
    updatedAt: NOW,
    isActive: true,
    includeInNetWorth: true,
  };
}

function creditCardItem(): FinancialItem {
  return { id: 'card-1', name: '虛構信用卡', direction: 'liability', type: 'credit_card', amount: createTwdAmount(2_000), overpaymentBalance: createTwdAmount(0), status: 'confirmed', updatedAt: NOW, isActive: true, includeInNetWorth: true };
}

function createImportSnapshot(): ImportBatchSnapshot {
  const observations: SourceObservation[] = [
    { id: 'observation-1', batchId: 'batch-1', observationFingerprint: 'a'.repeat(64), kind: 'credit_card_purchase', amount: 1200, statementEffect: 1200, occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date', summary: '虛構餐廳', pageNumber: 2, anonymousRowLocator: 'page-2-row-1', warningCodes: [] },
    { id: 'observation-2', batchId: 'batch-1', observationFingerprint: 'b'.repeat(64), amount: 100, statementEffect: -100, occurredAt: '2026-07-12T04:00:00.000Z', occurredAtPrecision: 'date', summary: '虛構扣抵', pageNumber: 2, anonymousRowLocator: 'page-2-row-2', warningCodes: [IMPORT_WARNING_CODES.negativeItemRequiresUserConfirmation] },
  ];
  const candidates: ImportCandidate[] = observations.map((item, index) => ({ id: `candidate-${index + 1}`, batchId: 'batch-1', observationId: item.id, kind: item.kind, amount: item.amount, occurredAt: item.occurredAt, occurredAtPrecision: item.occurredAtPrecision, name: item.summary, creditCardAccountId: 'card-1', updatedAt: NOW }));
  return { batch: { id: 'batch-1', sourceType: 'sinopac-credit-card-statement-pdf', sourceFileDigest: 'c'.repeat(64), statementMonth: '2026-07', creditCardAccountId: 'card-1', importedAt: NOW, parserName: 'sinopac-credit-card-statement', parserVersion: '1', statementDetailTotal: 1100, parsedDetailTotal: 1100 }, observations, candidates, reviewedDetailTotal: 1100, reconciliationDifference: 0, isReconciled: true, insights: candidates.map(({ id }) => ({ candidateId: id, duplicateObservationCount: 0, matches: [] })) };
}

function existingCardTransaction(): FinancialTransaction {
  return { id: 'existing-card-transaction', kind: 'credit_card_purchase', amount: createTwdAmount(1300), occurredAt: '2026-07-10T04:00:00.000Z', occurredAtPrecision: 'date', destinationAccountId: 'card-1', categoryId: 'expense-food', name: '既有虛構餐廳', note: '', createdAt: NOW, updatedAt: NOW };
}
