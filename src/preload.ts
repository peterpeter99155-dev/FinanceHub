import { contextBridge, ipcRenderer } from 'electron';

import {
  type BootstrapStatus,
  FinanceHubApi,
  IPC_CHANNELS,
} from './shared/bootstrap';
import type {
  FinancialItemDraft,
  FinancialItemSnapshot,
} from './shared/financial-items';
import type {
  CategoryDraft,
  CategoriesApi,
  FinancialItemCustomTypeDraft,
  FinancialItemCustomTypesApi,
} from './shared/management';
import type {
  TransactionDraft,
  TransactionMonthSnapshot,
} from './shared/transactions';
import {
  type IpcResult,
} from './shared/ipc-result';
import type { BackupStatus } from './shared/backups';
import type { ImportsApi } from './shared/imports';
import type { CandidateDecision } from './domain/import';
import type { ImportCandidateUpdate } from './application/import-service';

async function invoke<T>(
  channel: string,
  ...args: readonly unknown[]
): Promise<T> {
  const result = (await ipcRenderer.invoke(
    channel,
    ...args,
  )) as IpcResult<T>;

  if (!result.ok) {
    throw {
      code: result.code,
      details: result.details,
    };
  }

  return result.value;
}

const financeHubApi: FinanceHubApi = Object.freeze({
  getBootstrapStatus: () =>
    invoke<BootstrapStatus>(IPC_CHANNELS.getBootstrapStatus),
  unlockDatabase: (password: string) =>
    invoke<void>(IPC_CHANNELS.unlockDatabase, password),
  financialItems: Object.freeze({
    list: () =>
      invoke<FinancialItemSnapshot>(IPC_CHANNELS.listFinancialItems),
    create: (draft: FinancialItemDraft) =>
      invoke<FinancialItemSnapshot>(
        IPC_CHANNELS.createFinancialItem,
        draft,
      ),
    update: (id: string, draft: FinancialItemDraft) =>
      invoke<FinancialItemSnapshot>(
        IPC_CHANNELS.updateFinancialItem,
        id,
        draft,
      ),
    delete: (id: string) =>
      invoke<FinancialItemSnapshot>(
        IPC_CHANNELS.deleteFinancialItem,
        id,
      ),
  }),
  categories: Object.freeze({
    list: () =>
      invoke<Awaited<ReturnType<CategoriesApi['list']>>>(
        IPC_CHANNELS.listCategories,
      ),
    create: (draft: CategoryDraft) =>
      invoke<Awaited<ReturnType<CategoriesApi['create']>>>(
        IPC_CHANNELS.createCategory,
        draft,
      ),
    update: (id: string, draft: CategoryDraft) =>
      invoke<Awaited<ReturnType<CategoriesApi['update']>>>(
        IPC_CHANNELS.updateCategory,
        id,
        draft,
      ),
    delete: (id: string) =>
      invoke<Awaited<ReturnType<CategoriesApi['delete']>>>(
        IPC_CHANNELS.deleteCategory,
        id,
      ),
    reassignAndDelete: (id: string, replacementId: string) =>
      invoke<Awaited<ReturnType<CategoriesApi['reassignAndDelete']>>>(
        IPC_CHANNELS.reassignAndDeleteCategory,
        id,
        replacementId,
      ),
  }),
  financialItemCustomTypes: Object.freeze({
    list: () =>
      invoke<
        Awaited<ReturnType<FinancialItemCustomTypesApi['list']>>
      >(IPC_CHANNELS.listFinancialItemCustomTypes),
    create: (draft: FinancialItemCustomTypeDraft) =>
      invoke<
        Awaited<ReturnType<FinancialItemCustomTypesApi['create']>>
      >(
        IPC_CHANNELS.createFinancialItemCustomType,
        draft,
      ),
    update: (id: string, draft: FinancialItemCustomTypeDraft) =>
      invoke<
        Awaited<ReturnType<FinancialItemCustomTypesApi['update']>>
      >(
        IPC_CHANNELS.updateFinancialItemCustomType,
        id,
        draft,
      ),
    delete: (id: string) =>
      invoke<
        Awaited<ReturnType<FinancialItemCustomTypesApi['delete']>>
      >(
        IPC_CHANNELS.deleteFinancialItemCustomType,
        id,
      ),
  }),
  transactions: Object.freeze({
    listMonth: (year: number, month: number, offset = 0) =>
      invoke<TransactionMonthSnapshot>(
        IPC_CHANNELS.listTransactionsByMonth,
        year,
        month,
        offset,
      ),
    create: (
      draft: TransactionDraft,
      year: number,
      month: number,
    ) =>
      invoke<TransactionMonthSnapshot>(
        IPC_CHANNELS.createTransaction,
        draft,
        year,
        month,
      ),
    update: (
      id: string,
      draft: TransactionDraft,
      year: number,
      month: number,
    ) =>
      invoke<TransactionMonthSnapshot>(
        IPC_CHANNELS.updateTransaction,
        id,
        draft,
        year,
        month,
      ),
    delete: (id: string, year: number, month: number) =>
      invoke<TransactionMonthSnapshot>(
        IPC_CHANNELS.deleteTransaction,
        id,
        year,
        month,
      ),
  }),
  backups: Object.freeze({
    getStatus: () =>
      invoke<BackupStatus>(IPC_CHANNELS.getBackupStatus),
    waitForCurrentBackup: () =>
      invoke<BackupStatus>(IPC_CHANNELS.waitForBackupCompletion),
    createNow: () =>
      invoke<BackupStatus>(IPC_CHANNELS.createBackupNow),
    setAutomaticEnabled: (enabled: boolean) =>
      invoke<BackupStatus>(
        IPC_CHANNELS.setAutomaticBackupEnabled,
        enabled,
      ),
    setRetentionCount: (
      retentionCount: 3 | 7 | 14 | 30,
      confirmRemoval = false,
    ) =>
      invoke<BackupStatus>(
        IPC_CHANNELS.setBackupRetentionCount,
        retentionCount,
        confirmRemoval,
      ),
    openDirectory: () =>
      invoke<void>(IPC_CHANNELS.openBackupDirectory),
    exportLatest: () =>
      invoke<'exported' | 'cancelled'>(
        IPC_CHANNELS.exportLatestBackup,
      ),
  }),
  imports: Object.freeze({
    selectStatementFile: () =>
      invoke<Awaited<ReturnType<ImportsApi['selectStatementFile']>>>(
        IPC_CHANNELS.selectImportStatement,
      ),
    parseSelectedStatement: (
      selectionToken: string,
      pdfPassword: string,
      creditCardAccountId: string,
    ) => invoke<Awaited<ReturnType<ImportsApi['parseSelectedStatement']>>>(
      IPC_CHANNELS.parseSelectedImportStatement,
      selectionToken,
      pdfPassword,
      creditCardAccountId,
    ),
    getBatch: (id: string) =>
      invoke<Awaited<ReturnType<ImportsApi['getBatch']>>>(
        IPC_CHANNELS.getImportBatch,
        id,
      ),
    updateCandidate: (id: string, update: ImportCandidateUpdate) =>
      invoke<Awaited<ReturnType<ImportsApi['updateCandidate']>>>(
        IPC_CHANNELS.updateImportCandidate,
        id,
        update,
      ),
    confirmCandidates: (
      batchId: string,
      decisions: readonly CandidateDecision[],
    ) =>
      invoke<Awaited<ReturnType<ImportsApi['confirmCandidates']>>>(
        IPC_CHANNELS.confirmImportCandidates,
        batchId,
        decisions,
      ),
    excludeBatch: (batchId: string) =>
      invoke<Awaited<ReturnType<ImportsApi['excludeBatch']>>>(
        IPC_CHANNELS.excludeImportBatch,
        batchId,
      ),
  }),
});

contextBridge.exposeInMainWorld('financeHub', financeHubApi);
