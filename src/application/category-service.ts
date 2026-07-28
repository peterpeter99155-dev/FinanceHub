import { randomUUID } from 'node:crypto';

import {
  CATEGORY_KINDS,
  CategoryKind,
  FinancialCategory,
} from '../domain/category';
import type { CategoryRepository } from './ports/category-repository';

export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly createId: () => string = randomUUID,
  ) {}

  list(): readonly FinancialCategory[] {
    return this.repository.list();
  }

  create(input: unknown): readonly FinancialCategory[] {
    const draft = parseDraft(input);
    this.repository.create({
      id: this.createId(),
      ...draft,
      isBuiltIn: false,
      isActive: true,
    });
    return this.list();
  }

  update(idInput: unknown, input: unknown): readonly FinancialCategory[] {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(`Financial category "${id}" was not found.`);
    }

    const draft = parseDraft(input);
    this.repository.update({
      ...existing,
      ...draft,
    });
    return this.list();
  }

  delete(idInput: unknown): readonly FinancialCategory[] {
    this.repository.delete(parseId(idInput));
    return this.list();
  }

  reassignAndDelete(
    idInput: unknown,
    replacementIdInput: unknown,
  ): readonly FinancialCategory[] {
    this.repository.reassignAndDelete(
      parseId(idInput),
      parseId(replacementIdInput),
    );
    return this.list();
  }
}

function parseDraft(input: unknown): {
  kind: CategoryKind;
  name: string;
  isActive: boolean;
} {
  if (!isRecord(input)) {
    throw new Error('Financial category input is invalid.');
  }

  const kind = assertMember(input.kind, CATEGORY_KINDS, 'kind');
  const name =
    typeof input.name === 'string' ? input.name.trim() : '';

  if (name.length === 0 || name.length > 20) {
    throw new Error('Financial category name is invalid.');
  }

  if (typeof input.isActive !== 'boolean') {
    throw new Error('Financial category isActive must be a boolean.');
  }

  return { kind, name, isActive: input.isActive };
}

function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 100
  ) {
    throw new Error('Financial category id is invalid.');
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
    throw new Error(`Financial category ${field} is invalid.`);
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
