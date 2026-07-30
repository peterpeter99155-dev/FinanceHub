import type { FinancialCategory } from '../../src/domain/category';
import { systemClock } from '../../src/application/ports/clock';
import {
  FinancialItem,
  toTransactionAccount,
} from '../../src/domain/financial-item';
import type { FinancialItemCustomType } from '../../src/domain/financial-item-custom-type';
import { createTwdAmount } from '../../src/domain/money';
import type { FinancialTransaction } from '../../src/domain/transaction';
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
        backupStatus = {
          ...backupStatus,
          validBackupCount: backupStatus.validBackupCount + 1,
          lastSuccessfulAt: NOW,
        };
        return backupStatus;
      },
      setAutomaticEnabled: async (enabled) => {
        backupStatus = { ...backupStatus, automaticEnabled: enabled };
        return backupStatus;
      },
      setRetentionCount: async (retentionCount) => {
        backupStatus = { ...backupStatus, retentionCount };
        return backupStatus;
      },
      openDirectory: async () => undefined,
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
    status: 'confirmed',
    updatedAt: NOW,
    isActive: true,
    includeInNetWorth: true,
  };
}
