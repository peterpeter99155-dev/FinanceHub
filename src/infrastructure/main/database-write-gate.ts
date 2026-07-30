import { ERROR_CODES, FinanceHubError } from '../../shared/errors';

interface QueuedOperation<T> {
  readonly kind: 'write' | 'backup';
  readonly operation: () => T | Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

export class DatabaseWriteGate {
  private readonly queue: QueuedOperation<unknown>[] = [];
  private running = false;
  private closing = false;
  private backupQueued = false;
  private acceptedWrites = 0;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly maximumWrites = 100) {}

  runWrite<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.closing) {
      return Promise.reject(new FinanceHubError(
        ERROR_CODES.databaseLocked,
        '應用程式正在關閉，無法接受新的資料寫入。',
      ));
    }
    if (this.acceptedWrites >= this.maximumWrites) {
      return Promise.reject(new FinanceHubError(
        ERROR_CODES.backupWriteQueueFull,
        '等待中的資料寫入已達上限。',
      ));
    }
    this.acceptedWrites += 1;
    return this.enqueue('write', operation);
  }

  runBackup<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.backupQueued) {
      return Promise.reject(new FinanceHubError(
        ERROR_CODES.backupInProgress,
        '已有備份正在進行。',
      ));
    }
    if (this.closing) {
      return Promise.reject(new FinanceHubError(
        ERROR_CODES.databaseLocked,
        '應用程式正在關閉，無法開始備份。',
      ));
    }
    this.backupQueued = true;
    return this.enqueue('backup', operation);
  }

  async closeAndDrain(): Promise<void> {
    this.closing = true;
    if (!this.running && this.queue.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private enqueue<T>(
    kind: QueuedOperation<T>['kind'],
    operation: () => T | Promise<T>,
  ): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      this.queue.push({ kind, operation, resolve, reject } as QueuedOperation<unknown>);
    });
    void this.drain();
    return result;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      try {
        entry.resolve(await entry.operation());
      } catch (error) {
        entry.reject(error);
      } finally {
        if (entry.kind === 'write') this.acceptedWrites -= 1;
        if (entry.kind === 'backup') this.backupQueued = false;
      }
    }
    this.running = false;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}
