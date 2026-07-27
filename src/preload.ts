import { contextBridge, ipcRenderer } from 'electron';

import { FinanceHubApi, IPC_CHANNELS } from './shared/bootstrap';
import type { FinancialItemDraft } from './shared/financial-items';

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
});

contextBridge.exposeInMainWorld('financeHub', financeHubApi);
