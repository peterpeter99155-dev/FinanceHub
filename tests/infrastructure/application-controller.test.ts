import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationController,
  type IpcHandlerRegistry,
  type IpcOperation,
} from '../../src/infrastructure/main/application-controller';
import { IPC_CHANNELS } from '../../src/shared/bootstrap';
import type { BootstrapDatabase } from '../../src/infrastructure/database/bootstrap-database';
import type { SqliteDatabase } from '../../src/infrastructure/database/sqlite-database';

const TEST_PASSWORD = 'S3 controller password only';

describe('ApplicationController unlock boundary', () => {
  it('creates no financial services or handlers before successful unlock', async () => {
    const registry = new FakeIpcRegistry();
    let databaseOpened = false;
    let servicesCreated = false;
    let databaseClosed = false;
    const connection: BootstrapDatabase = {
      database: {} as SqliteDatabase,
      close: () => {
        databaseClosed = true;
      },
    };
    const controller = new ApplicationController(
      'financehub.db',
      registry,
      async (_databasePath, password) => {
        expect(password).toBe(TEST_PASSWORD);
        databaseOpened = true;
        return connection;
      },
      () => {
        servicesCreated = true;
        return fakeServices() as never;
      },
      '0.1.0',
      async () => undefined,
      async () => undefined,
      async () => ({
        path: 'C:\\private\\fictional-statement.pdf',
        content: new Uint8Array([7, 8, 9]),
      }),
    );

    controller.registerLockedHandlers();

    expect(databaseOpened).toBe(false);
    expect(servicesCreated).toBe(false);
    expect(registry.has(IPC_CHANNELS.unlockDatabase)).toBe(true);
    expect(registry.has(IPC_CHANNELS.listFinancialItems)).toBe(false);
    await expect(
      registry.invoke(IPC_CHANNELS.listFinancialItems),
    ).rejects.toThrow('No IPC handler registered');

    await registry.invoke(
      IPC_CHANNELS.unlockDatabase,
      TEST_PASSWORD,
    );

    expect(databaseOpened).toBe(true);
    expect(servicesCreated).toBe(true);
    expect(registry.has(IPC_CHANNELS.listFinancialItems)).toBe(true);
    expect(registry.has(IPC_CHANNELS.getBackupStatus)).toBe(true);
    expect(registry.has(IPC_CHANNELS.waitForBackupCompletion)).toBe(true);
    expect(registry.has(IPC_CHANNELS.createBackupNow)).toBe(true);
    expect(registry.has(IPC_CHANNELS.setAutomaticBackupEnabled)).toBe(true);
    expect(registry.has(IPC_CHANNELS.setBackupRetentionCount)).toBe(true);
    expect(registry.has(IPC_CHANNELS.openBackupDirectory)).toBe(true);
    expect(registry.has(IPC_CHANNELS.exportLatestBackup)).toBe(true);
    expect(registry.has(IPC_CHANNELS.selectImportStatement)).toBe(true);
    expect(registry.has(IPC_CHANNELS.parseSelectedImportStatement)).toBe(true);
    expect(registry.has(IPC_CHANNELS.getImportBatch)).toBe(true);
    expect(registry.has(IPC_CHANNELS.listImportBatches)).toBe(true);
    expect(registry.has(IPC_CHANNELS.updateImportCandidate)).toBe(true);
    expect(registry.has(IPC_CHANNELS.confirmImportCandidates)).toBe(true);
    expect(registry.has(IPC_CHANNELS.excludeImportBatch)).toBe(true);
    await expect(
      registry.invoke(IPC_CHANNELS.openBackupDirectory),
    ).resolves.toBeUndefined();
    await expect(
      registry.invoke(IPC_CHANNELS.exportLatestBackup),
    ).resolves.toBe('cancelled');
    const selected = await registry.invoke(
      IPC_CHANNELS.selectImportStatement,
    ) as { selectionToken: string };
    expect(JSON.stringify(selected)).not.toContain('private');
    await expect(registry.invoke(
      IPC_CHANNELS.parseSelectedImportStatement,
      selected.selectionToken,
      'single-use-pdf-password',
      'card-1',
    )).resolves.toBeUndefined();
    await expect(registry.invoke(
      IPC_CHANNELS.parseSelectedImportStatement,
      selected.selectionToken,
      'single-use-pdf-password',
      'card-1',
    )).rejects.toMatchObject({ code: 'IMPORT_SELECTION_UNAVAILABLE' });
    expect(registry.has(IPC_CHANNELS.unlockDatabase)).toBe(false);
    await controller.close();
    expect(databaseClosed).toBe(true);
  });

  it('serializes import batch creation and candidate updates through the write gate', async () => {
    const registry = new FakeIpcRegistry();
    let releaseCreateBatch!: () => void;
    const createBatch = vi.fn(() => new Promise<void>((resolve) => {
      releaseCreateBatch = resolve;
    }));
    const updateCandidate = vi.fn(() => 'updated');
    const baseServices = fakeServices();
    const services = {
      ...baseServices,
      imports: {
        ...baseServices.imports,
        createBatch,
        updateCandidate,
      },
    };
    const controller = new ApplicationController(
      'financehub.db',
      registry,
      async () => ({
        database: {} as SqliteDatabase,
        close: () => undefined,
      }),
      () => services as never,
      '0.1.0',
      async () => undefined,
      async () => undefined,
      async () => ({
        path: 'C:\\private\\fictional-statement.pdf',
        content: new Uint8Array([1]),
      }),
    );
    controller.registerLockedHandlers();
    await registry.invoke(IPC_CHANNELS.unlockDatabase, TEST_PASSWORD);
    const selection = await registry.invoke(
      IPC_CHANNELS.selectImportStatement,
    ) as { selectionToken: string };

    const parsing = registry.invoke(
      IPC_CHANNELS.parseSelectedImportStatement,
      selection.selectionToken,
      'single-use-pdf-password',
      'card-1',
    );
    await vi.waitFor(() => expect(createBatch).toHaveBeenCalledOnce());
    const updating = registry.invoke(
      IPC_CHANNELS.updateImportCandidate,
      'candidate-1',
      { amount: 1 },
    );
    await Promise.resolve();
    expect(updateCandidate).not.toHaveBeenCalled();

    releaseCreateBatch();
    await expect(parsing).resolves.toBeUndefined();
    await expect(updating).resolves.toBe('updated');
    expect(updateCandidate).toHaveBeenCalledOnce();
    await controller.close();
  });
});

class FakeIpcRegistry implements IpcHandlerRegistry {
  private readonly handlers = new Map<string, IpcOperation>();

  handle(channel: string, operation: IpcOperation): void {
    this.handlers.set(channel, operation);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  has(channel: string): boolean {
    return this.handlers.has(channel);
  }

  async invoke(
    channel: string,
    ...args: readonly unknown[]
  ): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No IPC handler registered for ${channel}`);
    }
    return handler(...args);
  }
}

function fakeServices() {
  return {
    financialItems: {
      list: () => undefined,
      create: () => undefined,
      update: () => undefined,
      delete: () => undefined,
    },
    categories: {
      list: () => undefined,
      create: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      reassignAndDelete: () => undefined,
    },
    customTypes: {
      list: () => undefined,
      create: () => undefined,
      update: () => undefined,
      delete: () => undefined,
    },
    transactions: {
      listMonth: () => undefined,
      create: () => undefined,
      update: () => undefined,
      delete: () => undefined,
    },
    imports: {
      createBatch: () => undefined,
      getBatch: () => undefined,
      updateCandidate: () => undefined,
      confirmCandidates: () => undefined,
      excludeBatch: () => undefined,
    },
  };
}
