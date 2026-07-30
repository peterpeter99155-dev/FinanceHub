import { describe, expect, it } from 'vitest';

import { DatabaseWriteGate } from '../../src/infrastructure/main/database-write-gate';
import { errorCodeOf, ERROR_CODES } from '../../src/shared/errors';

describe('DatabaseWriteGate', () => {
  it('finishes earlier writes, runs one backup, then releases later writes in FIFO order', async () => {
    const gate = new DatabaseWriteGate(100);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = gate.runWrite(async () => {
      order.push('write-1-start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push('write-1-end');
    });
    const backup = gate.runBackup(() => order.push('backup'));
    const second = gate.runWrite(() => order.push('write-2'));
    releaseFirst();
    await Promise.all([first, backup, second]);
    expect(order).toEqual([
      'write-1-start',
      'write-1-end',
      'backup',
      'write-2',
    ]);
  });

  it('releases queued writes after backup failure', async () => {
    const gate = new DatabaseWriteGate();
    const backup = gate.runBackup(() => {
      throw new Error('fault');
    });
    const write = gate.runWrite(() => 'continued');
    await expect(backup).rejects.toThrow('fault');
    await expect(write).resolves.toBe('continued');
  });

  it('rejects a second backup and writes above the configured limit', async () => {
    const gate = new DatabaseWriteGate(1);
    let release!: () => void;
    const write = gate.runWrite(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    await expect(gate.runWrite(() => undefined)).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupWriteQueueFull,
    );
    const backup = gate.runBackup(() => undefined);
    await expect(gate.runBackup(() => undefined)).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.backupInProgress,
    );
    release();
    await Promise.all([write, backup]);
  });

  it('drains accepted work before closing and rejects later writes', async () => {
    const gate = new DatabaseWriteGate();
    const completed: number[] = [];
    const accepted = gate.runWrite(() => completed.push(1));
    await gate.closeAndDrain();
    await accepted;
    expect(completed).toEqual([1]);
    await expect(gate.runWrite(() => undefined)).rejects.toSatisfy(
      (error: unknown) => errorCodeOf(error) === ERROR_CODES.databaseLocked,
    );
  });
});
