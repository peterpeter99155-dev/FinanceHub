import { CategoryService } from '../../application/category-service';
import path from 'node:path';
import { FinancialItemCustomTypeService } from '../../application/financial-item-custom-type-service';
import { FinancialItemService } from '../../application/financial-item-service';
import { TransactionService } from '../../application/transaction-service';
import {
  type BootstrapStatus,
  IPC_CHANNELS,
} from '../../shared/bootstrap';
import { FinanceHubError, ERROR_CODES } from '../../shared/errors';
import type { BootstrapDatabase } from '../database/bootstrap-database';
import { openOrCreateEncryptedDatabase } from '../database/encrypted-database';
import { SqliteCategoryRepository } from '../database/sqlite-category-repository';
import { SqliteFinancialItemCustomTypeRepository } from '../database/sqlite-financial-item-custom-type-repository';
import { SqliteFinancialItemRepository } from '../database/sqlite-financial-item-repository';
import { SqliteTransactionRepository } from '../database/sqlite-transaction-repository';
import {
  databasePaths,
  inspectDatabaseFiles,
} from '../security/database-metadata';

export type IpcOperation = (...args: readonly unknown[]) => unknown;

export interface IpcHandlerRegistry {
  handle(channel: string, operation: IpcOperation): void;
  removeHandler(channel: string): void;
}

interface FinancialServices {
  readonly financialItems: FinancialItemService;
  readonly categories: CategoryService;
  readonly customTypes: FinancialItemCustomTypeService;
  readonly transactions: TransactionService;
}

type DatabaseOpener = (
  databasePath: string,
  password: string,
) => Promise<BootstrapDatabase>;

type ServiceFactory = (
  connection: BootstrapDatabase,
) => FinancialServices;

export class ApplicationController {
  private connection: BootstrapDatabase | undefined;
  private state: 'locked' | 'unlocking' | 'unlocked' = 'locked';

  constructor(
    private readonly databasePath: string,
    private readonly registry: IpcHandlerRegistry,
    private readonly openDatabase: DatabaseOpener =
      openOrCreateEncryptedDatabase,
    private readonly createServices: ServiceFactory =
      createFinancialServices,
  ) {}

  registerLockedHandlers(): void {
    this.registry.handle(
      IPC_CHANNELS.getBootstrapStatus,
      () => this.getBootstrapStatus(),
    );
    this.registry.handle(
      IPC_CHANNELS.unlockDatabase,
      (password: unknown) => this.unlock(password),
    );
  }

  close(): void {
    this.connection?.close();
    this.connection = undefined;
    this.state = 'locked';
  }

  private async getBootstrapStatus(): Promise<BootstrapStatus> {
    if (this.state === 'unlocked') {
      return bootstrapStatus('unlocked', this.databasePath);
    }

    const fileState = await inspectDatabaseFiles(
      databasePaths(this.databasePath),
    );
    return bootstrapStatus(
      fileState === 'new' ? 'setup_required' : 'locked',
      this.databasePath,
    );
  }

  private async unlock(password: unknown): Promise<void> {
    if (this.state !== 'locked') {
      throw new FinanceHubError(
        ERROR_CODES.databaseAlreadyUnlocked,
        '資料庫已解鎖或正在解鎖。',
      );
    }
    if (typeof password !== 'string') {
      throw new FinanceHubError(
        ERROR_CODES.invalidPassword,
        '主密碼格式不正確。',
      );
    }

    this.state = 'unlocking';
    let connection: BootstrapDatabase | undefined;
    try {
      connection = await this.openDatabase(
        this.databasePath,
        password,
      );
      const services = this.createServices(connection);
      registerFinancialHandlers(this.registry, services);
      this.connection = connection;
      this.state = 'unlocked';
      this.registry.removeHandler(IPC_CHANNELS.unlockDatabase);
    } catch (error) {
      connection?.close();
      this.state = 'locked';
      throw error;
    }
  }
}

function bootstrapStatus(
  databaseState: BootstrapStatus['databaseState'],
  databasePath: string,
): BootstrapStatus {
  return {
    appName: 'FinanceHub',
    databaseReady: databaseState === 'unlocked',
    databaseState,
    databaseDirectory: path.dirname(databasePath),
    databaseFileName: path.basename(databasePath),
    metadataFileName: `${path.basename(databasePath)}.metadata.json`,
    storagePolicy: 'sample-data-only',
  };
}

function createFinancialServices(
  connection: BootstrapDatabase,
): FinancialServices {
  const financialItems = new SqliteFinancialItemRepository(
    connection.database,
  );
  const categories = new SqliteCategoryRepository(
    connection.database,
  );
  const customTypes = new SqliteFinancialItemCustomTypeRepository(
    connection.database,
  );
  const transactions = new SqliteTransactionRepository(
    connection.database,
  );

  return {
    financialItems: new FinancialItemService(
      financialItems,
      undefined,
      undefined,
      customTypes,
      transactions,
    ),
    categories: new CategoryService(categories, transactions),
    customTypes: new FinancialItemCustomTypeService(
      customTypes,
      financialItems,
    ),
    transactions: new TransactionService(
      transactions,
      categories,
      financialItems,
    ),
  };
}

function registerFinancialHandlers(
  registry: IpcHandlerRegistry,
  services: FinancialServices,
): void {
  registry.handle(IPC_CHANNELS.listFinancialItems, () =>
    services.financialItems.list(),
  );
  registry.handle(
    IPC_CHANNELS.createFinancialItem,
    (draft: unknown) => services.financialItems.create(draft),
  );
  registry.handle(
    IPC_CHANNELS.updateFinancialItem,
    (id: unknown, draft: unknown) =>
      services.financialItems.update(id, draft),
  );
  registry.handle(
    IPC_CHANNELS.deleteFinancialItem,
    (id: unknown) => services.financialItems.delete(id),
  );
  registry.handle(IPC_CHANNELS.listCategories, () =>
    services.categories.list(),
  );
  registry.handle(
    IPC_CHANNELS.createCategory,
    (draft: unknown) => services.categories.create(draft),
  );
  registry.handle(
    IPC_CHANNELS.updateCategory,
    (id: unknown, draft: unknown) =>
      services.categories.update(id, draft),
  );
  registry.handle(
    IPC_CHANNELS.deleteCategory,
    (id: unknown) => services.categories.delete(id),
  );
  registry.handle(
    IPC_CHANNELS.reassignAndDeleteCategory,
    (id: unknown, replacementId: unknown) =>
      services.categories.reassignAndDelete(id, replacementId),
  );
  registry.handle(IPC_CHANNELS.listFinancialItemCustomTypes, () =>
    services.customTypes.list(),
  );
  registry.handle(
    IPC_CHANNELS.createFinancialItemCustomType,
    (draft: unknown) => services.customTypes.create(draft),
  );
  registry.handle(
    IPC_CHANNELS.updateFinancialItemCustomType,
    (id: unknown, draft: unknown) =>
      services.customTypes.update(id, draft),
  );
  registry.handle(
    IPC_CHANNELS.deleteFinancialItemCustomType,
    (id: unknown) => services.customTypes.delete(id),
  );
  registry.handle(
    IPC_CHANNELS.listTransactionsByMonth,
    (year: unknown, month: unknown, offset: unknown) =>
      services.transactions.listMonth(year, month, offset),
  );
  registry.handle(
    IPC_CHANNELS.createTransaction,
    (
      draft: unknown,
      year: unknown,
      month: unknown,
    ) => services.transactions.create(draft, year, month),
  );
  registry.handle(
    IPC_CHANNELS.updateTransaction,
    (
      id: unknown,
      draft: unknown,
      year: unknown,
      month: unknown,
    ) => services.transactions.update(id, draft, year, month),
  );
  registry.handle(
    IPC_CHANNELS.deleteTransaction,
    (id: unknown, year: unknown, month: unknown) =>
      services.transactions.delete(id, year, month),
  );
}
