import type { FinancialItemsApi } from './financial-items';

export const IPC_CHANNELS = {
  getBootstrapStatus: 'app:get-bootstrap-status',
  listFinancialItems: 'financial-items:list',
  createFinancialItem: 'financial-items:create',
  updateFinancialItem: 'financial-items:update',
  deactivateFinancialItem: 'financial-items:deactivate',
} as const;

export interface BootstrapStatus {
  appName: string;
  databaseReady: boolean;
  storagePolicy: 'sample-data-only';
}

export interface FinanceHubApi {
  getBootstrapStatus(): Promise<BootstrapStatus>;
  financialItems: FinancialItemsApi;
}
