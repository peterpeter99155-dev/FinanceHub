import type { FinancialItemsApi } from './financial-items';
import type {
  CategoriesApi,
  FinancialItemCustomTypesApi,
} from './management';
import type { TransactionsApi } from './transactions';

export const IPC_CHANNELS = {
  getBootstrapStatus: 'app:get-bootstrap-status',
  unlockDatabase: 'app:unlock-database',
  listFinancialItems: 'financial-items:list',
  createFinancialItem: 'financial-items:create',
  updateFinancialItem: 'financial-items:update',
  deleteFinancialItem: 'financial-items:delete',
  listCategories: 'categories:list',
  createCategory: 'categories:create',
  updateCategory: 'categories:update',
  deleteCategory: 'categories:delete',
  reassignAndDeleteCategory: 'categories:reassign-and-delete',
  listFinancialItemCustomTypes: 'financial-item-custom-types:list',
  createFinancialItemCustomType: 'financial-item-custom-types:create',
  updateFinancialItemCustomType: 'financial-item-custom-types:update',
  deleteFinancialItemCustomType: 'financial-item-custom-types:delete',
  listTransactionsByMonth: 'transactions:list-month',
  createTransaction: 'transactions:create',
  updateTransaction: 'transactions:update',
  deleteTransaction: 'transactions:delete',
} as const;

export interface BootstrapStatus {
  appName: string;
  databaseReady: boolean;
  databaseState: 'setup_required' | 'locked' | 'unlocked';
  storagePolicy: 'sample-data-only';
}

export interface FinanceHubApi {
  getBootstrapStatus(): Promise<BootstrapStatus>;
  unlockDatabase(password: string): Promise<void>;
  financialItems: FinancialItemsApi;
  categories: CategoriesApi;
  financialItemCustomTypes: FinancialItemCustomTypesApi;
  transactions: TransactionsApi;
}
