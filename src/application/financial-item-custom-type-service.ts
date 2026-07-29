import { randomUUID } from 'node:crypto';

import type { FinancialItemCustomType } from '../domain/financial-item-custom-type';
import {
  FINANCIAL_ITEM_DIRECTIONS,
  FinancialItemDirection,
} from '../domain/financial-item';
import type { FinancialItemCustomTypeRepository } from './ports/financial-item-custom-type-repository';
import type { FinancialItemRepository } from './ports/financial-item-repository';

export class FinancialItemCustomTypeService {
  constructor(
    private readonly repository: FinancialItemCustomTypeRepository,
    private readonly financialItems: FinancialItemRepository,
    private readonly createId: () => string = randomUUID,
  ) {}

  list(): readonly FinancialItemCustomType[] {
    return this.repository.list();
  }

  create(input: unknown): readonly FinancialItemCustomType[] {
    const draft = parseDraft(input);
    this.repository.create({
      id: this.createId(),
      ...draft,
      isActive: true,
    });
    return this.list();
  }

  update(
    idInput: unknown,
    input: unknown,
  ): readonly FinancialItemCustomType[] {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(
        `Financial item custom type "${id}" was not found.`,
      );
    }

    const draft = parseDraft(input);
    const usageCount = this.financialItems.countByCustomTypeId(id);

    if (existing.direction !== draft.direction && usageCount > 0) {
      throw new Error(
        'A used custom type cannot change between asset and liability.',
      );
    }
    if (existing.isActive && !draft.isActive && usageCount > 0) {
      throw new Error('A used custom type cannot be deactivated.');
    }

    this.repository.update({
      ...existing,
      ...draft,
    });
    return this.list();
  }

  delete(idInput: unknown): readonly FinancialItemCustomType[] {
    const id = parseId(idInput);
    const usageCount = this.financialItems.countByCustomTypeId(id);

    if (usageCount > 0) {
      throw new Error(
        `Financial item custom type is used by ${usageCount} item(s).`,
      );
    }

    this.repository.delete(id);
    return this.list();
  }
}

function parseDraft(input: unknown): {
  direction: FinancialItemDirection;
  name: string;
  isActive: boolean;
} {
  if (!isRecord(input)) {
    throw new Error('Financial item custom type input is invalid.');
  }

  const direction = assertMember(
    input.direction,
    FINANCIAL_ITEM_DIRECTIONS,
    'direction',
  );
  const name =
    typeof input.name === 'string' ? input.name.trim() : '';

  if (name.length === 0 || name.length > 20) {
    throw new Error('Financial item custom type name is invalid.');
  }

  if (typeof input.isActive !== 'boolean') {
    throw new Error(
      'Financial item custom type isActive must be a boolean.',
    );
  }

  return { direction, name, isActive: input.isActive };
}

function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 100
  ) {
    throw new Error('Financial item custom type id is invalid.');
  }

  return value;
}

function assertMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (
    typeof value !== 'string' ||
    !allowed.includes(value as T)
  ) {
    throw new Error(`Financial item custom type ${field} is invalid.`);
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
