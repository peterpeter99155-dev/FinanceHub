import { randomUUID } from 'node:crypto';

import {
  DATA_STATUSES,
  FINANCIAL_ITEM_DIRECTIONS,
  FINANCIAL_ITEM_TYPES,
  MAX_FINANCIAL_ITEM_AMOUNT_TWD,
  DataStatus,
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
} from '../domain/financial-item';
import { createTwdAmount } from '../domain/money';
import { calculateNetWorth } from '../domain/net-worth';
import type {
  FinancialItemDraft,
  FinancialItemSnapshot,
} from '../shared/financial-items';
import { FINANCIAL_ITEM_TYPE_LABELS } from '../shared/financial-item-labels';
import type { FinancialItemRepository } from './ports/financial-item-repository';

export class FinancialItemService {
  constructor(
    private readonly repository: FinancialItemRepository,
    private readonly createId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(): FinancialItemSnapshot {
    return this.snapshot();
  }

  create(input: unknown): FinancialItemSnapshot {
    const draft = parseDraft(input);
    const item: FinancialItem = {
      id: this.createId(),
      ...draft,
      amount: createTwdAmount(draft.amount),
      updatedAt: this.now(),
      isActive: true,
    };

    this.repository.create(item);
    return this.snapshot();
  }

  update(idInput: unknown, input: unknown): FinancialItemSnapshot {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(`Financial item "${id}" was not found.`);
    }

    const draft = parseDraft(input);
    this.repository.update({
      ...existing,
      ...draft,
      amount: createTwdAmount(draft.amount),
      updatedAt: this.now(),
    });

    return this.snapshot();
  }

  delete(idInput: unknown): FinancialItemSnapshot {
    const id = parseId(idInput);
    this.repository.delete(id);
    return this.snapshot();
  }

  private snapshot(): FinancialItemSnapshot {
    const items = this.repository.list();
    const summary = calculateNetWorth(items);

    return {
      items,
      summary,
    };
  }
}

function parseDraft(input: unknown): FinancialItemDraft {
  if (!isRecord(input)) {
    throw new Error('Financial item input is invalid.');
  }

  const direction = assertAllowed(
    input.direction,
    FINANCIAL_ITEM_DIRECTIONS,
    'direction',
  );
  const type = assertAllowed(input.type, FINANCIAL_ITEM_TYPES, 'type');
  const status = assertAllowed(input.status, DATA_STATUSES, 'status');
  const requestedName =
    typeof input.name === 'string' ? input.name.trim() : '';
  const name =
    requestedName.length > 0
      ? requestedName
      : FINANCIAL_ITEM_TYPE_LABELS[type];

  if (name.length > 100) {
    throw new Error('Name cannot exceed 100 characters.');
  }

  if (typeof input.amount !== 'number') {
    throw new Error('Amount must be a number.');
  }

  const amount = createTwdAmount(input.amount);

  if (amount === 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (amount > MAX_FINANCIAL_ITEM_AMOUNT_TWD) {
    throw new Error('Amount exceeds the allowed maximum.');
  }

  if (typeof input.includeInNetWorth !== 'boolean') {
    throw new Error('includeInNetWorth must be a boolean.');
  }

  return {
    name,
    direction: direction as FinancialItemDirection,
    type: type as FinancialItemType,
    amount,
    status: status as DataStatus,
    includeInNetWorth: input.includeInNetWorth,
  };
}

function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100
  ) {
    throw new Error('Financial item id is invalid.');
  }

  return value;
}

function assertAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (
    typeof value !== 'string' ||
    !allowed.includes(value as T)
  ) {
    throw new Error(`Financial item ${field} is invalid.`);
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
