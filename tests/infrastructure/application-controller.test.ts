import { describe, expect, it } from 'vitest';

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
    await controller.close();
    expect(databaseClosed).toBe(true);
    expect(registry.has(IPC_CHANNELS.listFinancialItems)).toBe(true);
    expect(registry.has(IPC_CHANNELS.getBackupStatus)).toBe(true);
    expect(registry.has(IPC_CHANNELS.createBackupNow)).toBe(true);
    expect(registry.has(IPC_CHANNELS.setAutomaticBackupEnabled)).toBe(true);
    expect(registry.has(IPC_CHANNELS.setBackupRetentionCount)).toBe(true);
    expect(registry.has(IPC_CHANNELS.openBackupDirectory)).toBe(true);
    await expect(
      registry.invoke(IPC_CHANNELS.openBackupDirectory),
    ).resolves.toBeUndefined();
    expect(registry.has(IPC_CHANNELS.unlockDatabase)).toBe(false);
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
  };
}
