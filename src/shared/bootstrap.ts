import type { FinancialItemsApi } from './financial-items';
import type {
  CategoriesApi,
  FinancialItemCustomTypesApi,
} from './management';
import type { TransactionsApi } from './transactions';
import type { BackupsApi } from './backups';
import type { ImportsApi } from './imports';

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
  getBackupStatus: 'backups:get-status',
  waitForBackupCompletion: 'backups:wait-for-completion',
  createBackupNow: 'backups:create-now',
  setAutomaticBackupEnabled: 'backups:set-automatic-enabled',
  setBackupRetentionCount: 'backups:set-retention-count',
  openBackupDirectory: 'backups:open-directory',
  exportLatestBackup: 'backups:export-latest',
  selectImportStatement: 'imports:select-statement',
  parseSelectedImportStatement: 'imports:parse-selected-statement',
  getImportBatch: 'imports:get-batch',
  listImportBatches: 'imports:list-batches',
  updateImportCandidate: 'imports:update-candidate',
  confirmImportCandidates: 'imports:confirm-candidates',
  excludeImportBatch: 'imports:exclude-batch',
  removeImportBatch: 'imports:remove-batch',
} as const;

export interface BootstrapStatus {
  appName: string;
  databaseReady: boolean;
  databaseState: 'setup_required' | 'locked' | 'unlocked';
  databaseDirectory: string;
  databaseFileName: string;
  metadataFileName: string;
  storagePolicy: 'sample-data-only';
}

export interface FinanceHubApi {
  getBootstrapStatus(): Promise<BootstrapStatus>;
  unlockDatabase(password: string): Promise<void>;
  financialItems: FinancialItemsApi;
  categories: CategoriesApi;
  financialItemCustomTypes: FinancialItemCustomTypesApi;
  transactions: TransactionsApi;
  backups: BackupsApi;
  imports: ImportsApi;
}
