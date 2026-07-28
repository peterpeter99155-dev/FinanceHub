import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

import { FinancialItemService } from './application/financial-item-service';
import { CategoryService } from './application/category-service';
import { FinancialItemCustomTypeService } from './application/financial-item-custom-type-service';
import { TransactionService } from './application/transaction-service';
import { openBootstrapDatabase } from './infrastructure/database/bootstrap-database';
import { SqliteFinancialItemRepository } from './infrastructure/database/sqlite-financial-item-repository';
import { SqliteCategoryRepository } from './infrastructure/database/sqlite-category-repository';
import { SqliteFinancialItemCustomTypeRepository } from './infrastructure/database/sqlite-financial-item-custom-type-repository';
import { SqliteTransactionRepository } from './infrastructure/database/sqlite-transaction-repository';
import {
  BootstrapStatus,
  IPC_CHANNELS,
} from './shared/bootstrap';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let closeDatabase: (() => void) | null = null;

function registerApplicationHandlers(
  financialItemService: FinancialItemService,
  categoryService: CategoryService,
  customTypeService: FinancialItemCustomTypeService,
  transactionService: TransactionService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.getBootstrapStatus,
    (): BootstrapStatus => ({
      appName: 'FinanceHub',
      databaseReady: true,
      storagePolicy: 'sample-data-only',
    }),
  );
  ipcMain.handle(IPC_CHANNELS.listFinancialItems, () =>
    financialItemService.list(),
  );
  ipcMain.handle(
    IPC_CHANNELS.createFinancialItem,
    (_event, draft: unknown) => financialItemService.create(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateFinancialItem,
    (_event, id: unknown, draft: unknown) =>
      financialItemService.update(id, draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteFinancialItem,
    (_event, id: unknown) => financialItemService.delete(id),
  );
  ipcMain.handle(IPC_CHANNELS.listCategories, () =>
    categoryService.list(),
  );
  ipcMain.handle(
    IPC_CHANNELS.createCategory,
    (_event, draft: unknown) => categoryService.create(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateCategory,
    (_event, id: unknown, draft: unknown) =>
      categoryService.update(id, draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteCategory,
    (_event, id: unknown) => categoryService.delete(id),
  );
  ipcMain.handle(
    IPC_CHANNELS.reassignAndDeleteCategory,
    (_event, id: unknown, replacementId: unknown) =>
      categoryService.reassignAndDelete(id, replacementId),
  );
  ipcMain.handle(IPC_CHANNELS.listFinancialItemCustomTypes, () =>
    customTypeService.list(),
  );
  ipcMain.handle(
    IPC_CHANNELS.createFinancialItemCustomType,
    (_event, draft: unknown) => customTypeService.create(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateFinancialItemCustomType,
    (_event, id: unknown, draft: unknown) =>
      customTypeService.update(id, draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteFinancialItemCustomType,
    (_event, id: unknown) => customTypeService.delete(id),
  );
  ipcMain.handle(
    IPC_CHANNELS.listTransactionsByMonth,
    (_event, year: unknown, month: unknown, offset: unknown) =>
      transactionService.listMonth(year, month, offset),
  );
  ipcMain.handle(
    IPC_CHANNELS.createTransaction,
    (_event, draft: unknown, year: unknown, month: unknown) =>
      transactionService.create(draft, year, month),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateTransaction,
    (
      _event,
      id: unknown,
      draft: unknown,
      year: unknown,
      month: unknown,
    ) => transactionService.update(id, draft, year, month),
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteTransaction,
    (_event, id: unknown, year: unknown, month: unknown) =>
      transactionService.delete(id, year, month),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#f5f7f4',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  const databasePath = path.join(app.getPath('userData'), 'financehub.dev.db');
  const bootstrapDatabase = openBootstrapDatabase(databasePath);
  closeDatabase = bootstrapDatabase.close;
  const repository = new SqliteFinancialItemRepository(
    bootstrapDatabase.database,
  );
  const categoryRepository = new SqliteCategoryRepository(
    bootstrapDatabase.database,
  );
  const customTypeRepository =
    new SqliteFinancialItemCustomTypeRepository(
      bootstrapDatabase.database,
    );
  const financialItemService = new FinancialItemService(
    repository,
    undefined,
    undefined,
    customTypeRepository,
  );
  const categoryService = new CategoryService(categoryRepository);
  const customTypeService = new FinancialItemCustomTypeService(
    customTypeRepository,
  );
  const transactionService = new TransactionService(
    new SqliteTransactionRepository(bootstrapDatabase.database),
    categoryRepository,
  );

  registerApplicationHandlers(
    financialItemService,
    categoryService,
    customTypeService,
    transactionService,
  );
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  closeDatabase?.();
  closeDatabase = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
