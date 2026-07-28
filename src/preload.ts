import { contextBridge, ipcRenderer } from 'electron';

import { FinanceHubApi, IPC_CHANNELS } from './shared/bootstrap';
import type { FinancialItemDraft } from './shared/financial-items';
import type {
  CategoryDraft,
  FinancialItemCustomTypeDraft,
} from './shared/management';
import type { TransactionDraft } from './shared/transactions';

const financeHubApi: FinanceHubApi = Object.freeze({
  getBootstrapStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getBootstrapStatus),
  financialItems: Object.freeze({
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listFinancialItems),
    create: (draft: FinancialItemDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.createFinancialItem, draft),
    update: (id: string, draft: FinancialItemDraft) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.updateFinancialItem,
        id,
        draft,
      ),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.deleteFinancialItem, id),
  }),
  categories: Object.freeze({
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listCategories),
    create: (draft: CategoryDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.createCategory, draft),
    update: (id: string, draft: CategoryDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.updateCategory, id, draft),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.deleteCategory, id),
    reassignAndDelete: (id: string, replacementId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.reassignAndDeleteCategory,
        id,
        replacementId,
      ),
  }),
  financialItemCustomTypes: Object.freeze({
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.listFinancialItemCustomTypes),
    create: (draft: FinancialItemCustomTypeDraft) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.createFinancialItemCustomType,
        draft,
      ),
    update: (id: string, draft: FinancialItemCustomTypeDraft) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.updateFinancialItemCustomType,
        id,
        draft,
      ),
    delete: (id: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.deleteFinancialItemCustomType,
        id,
      ),
  }),
  transactions: Object.freeze({
    listMonth: (year: number, month: number, offset = 0) =>
      ipcRenderer.invoke(
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
      ipcRenderer.invoke(
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
      ipcRenderer.invoke(
        IPC_CHANNELS.updateTransaction,
        id,
        draft,
        year,
        month,
      ),
    delete: (id: string, year: number, month: number) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.deleteTransaction,
        id,
        year,
        month,
      ),
  }),
});

contextBridge.exposeInMainWorld('financeHub', financeHubApi);
