import { randomUUID } from 'node:crypto';
import {
  ERROR_CODES,
  FinanceHubError,
} from '../shared/errors';

import {
  CATEGORY_KINDS,
  CategoryKind,
  FinancialCategory,
  assertUniqueActiveCategoryName,
  getCategoryRemovalPolicy,
} from '../domain/category';
import type { CategoryRepository } from './ports/category-repository';
import type { TransactionRepository } from './ports/transaction-repository';

export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly createId: () => string = randomUUID,
  ) {}

  list(): readonly FinancialCategory[] {
    return this.repository.list();
  }

  create(input: unknown): readonly FinancialCategory[] {
    const draft = parseDraft(input);
    const category = {
      id: this.createId(),
      ...draft,
      isBuiltIn: false,
      isActive: true,
    };
    assertUniqueActiveCategoryName(this.repository.list(), category);
    this.repository.create(category);
    return this.list();
  }

  update(idInput: unknown, input: unknown): readonly FinancialCategory[] {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(`Financial category "${id}" was not found.`);
    }
    if (existing.isBuiltIn) {
      throw new FinanceHubError(
        ERROR_CODES.builtInImmutable,
        'Built-in financial categories cannot be modified.',
      );
    }

    const draft = parseDraft(input);
    if (
      existing.kind !== draft.kind &&
      this.transactions.countByCategoryId(id) > 0
    ) {
      throw new Error(
        'A used financial category cannot change between income and expense.',
      );
    }
    const category = {
      ...existing,
      ...draft,
    };
    assertUniqueActiveCategoryName(this.repository.list(), category);
    this.repository.update(category);
    return this.list();
  }

  delete(idInput: unknown): readonly FinancialCategory[] {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(`Financial category "${id}" was not found.`);
    }
    if (existing.isBuiltIn) {
      throw new FinanceHubError(
        ERROR_CODES.builtInImmutable,
        'Built-in financial categories cannot be deleted.',
      );
    }

    const policy = getCategoryRemovalPolicy(
      this.transactions.countByCategoryId(id),
    );

    if (policy.action === 'reassign_required') {
      throw new FinanceHubError(
        ERROR_CODES.resourceInUse,
        `Financial category is used by ${policy.usageCount} transaction(s).`,
        { usageCount: policy.usageCount },
      );
    }

    this.repository.delete(id);
    return this.list();
  }

  reassignAndDelete(
    idInput: unknown,
    replacementIdInput: unknown,
  ): readonly FinancialCategory[] {
    const id = parseId(idInput);
    const replacementId = parseId(replacementIdInput);
    const source = this.repository.findById(id);
    const replacement = this.repository.findById(replacementId);

    if (id === replacementId) {
      throw new Error('Replacement category must be different.');
    }
    if (!source) {
      throw new Error(`Financial category "${id}" was not found.`);
    }
    if (source.isBuiltIn) {
      throw new FinanceHubError(
        ERROR_CODES.builtInImmutable,
        'Built-in financial categories cannot be deleted.',
      );
    }
    if (!replacement || !replacement.isActive) {
      throw new Error('Replacement category must be active.');
    }
    if (source.kind !== replacement.kind) {
      throw new Error('Replacement category must have the same kind.');
    }

    this.transactions.runInTransaction(() => {
      this.transactions.reassignCategory(id, replacementId);
      this.repository.delete(id);
    });
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
