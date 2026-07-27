import { contextBridge, ipcRenderer } from 'electron';

import { FinanceHubApi, IPC_CHANNELS } from './shared/bootstrap';

const financeHubApi: FinanceHubApi = Object.freeze({
  getBootstrapStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getBootstrapStatus),
});

contextBridge.exposeInMainWorld('financeHub', financeHubApi);
