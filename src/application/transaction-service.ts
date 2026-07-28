import { randomUUID } from 'node:crypto';

import type { CategoryRepository } from './ports/category-repository';
import type { TransactionRepository } from './ports/transaction-repository';
import {
  MAX_TRANSACTION_AMOUNT_TWD,
  MAX_TRANSACTION_NAME_LENGTH,
  MAX_TRANSACTION_NOTE_LENGTH,
  TRANSACTION_KINDS,
  FinancialTransaction,
  TransactionKind,
} from '../domain/transaction';
import { createTwdAmount } from '../domain/money';
import type {
  TransactionDraft,
  TransactionMonthSnapshot,
} from '../shared/transactions';

const PAGE_SIZE = 50;

export class TransactionService {
  constructor(
    private readonly repository: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly createId: () => string = randomUUID,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  listMonth(
    yearInput: unknown,
    monthInput: unknown,
    offsetInput: unknown = 0,
  ): TransactionMonthSnapshot {
    const { year, month } = parseMonth(yearInput, monthInput);
    const offset = parseOffset(offsetInput);
    const page = this.repository.listByMonth(
      year,
      month,
      offset,
      PAGE_SIZE,
    );

    return {
      year,
      month,
      ...page,
      summary: this.repository.summarizeMonth(year, month),
    };
  }

  create(
    input: unknown,
    yearInput: unknown,
    monthInput: unknown,
  ): TransactionMonthSnapshot {
    const now = this.now();
    const draft = this.parseDraft(input);
    const transaction: FinancialTransaction = {
      id: this.createId(),
      ...draft,
      amount: createTwdAmount(draft.amount),
      createdAt: now,
      updatedAt: now,
    };

    this.repository.create(transaction);
    return this.listMonth(yearInput, monthInput);
  }

  update(
    idInput: unknown,
    input: unknown,
    yearInput: unknown,
    monthInput: unknown,
  ): TransactionMonthSnapshot {
    const id = parseId(idInput);
    const existing = this.repository.findById(id);

    if (!existing) {
      throw new Error(`Financial transaction "${id}" was not found.`);
    }

    const draft = this.parseDraft(input);
    this.repository.update({
      ...existing,
      ...draft,
      amount: createTwdAmount(draft.amount),
      updatedAt: this.now(),
    });
    return this.listMonth(yearInput, monthInput);
  }

  delete(
    idInput: unknown,
    yearInput: unknown,
    monthInput: unknown,
  ): TransactionMonthSnapshot {
    this.repository.delete(parseId(idInput), this.now());
    return this.listMonth(yearInput, monthInput);
  }

  private parseDraft(input: unknown): TransactionDraft {
    if (!isRecord(input)) {
      throw new Error('Financial transaction input is invalid.');
    }

    const kind = assertMember(input.kind, TRANSACTION_KINDS, 'kind');
    const amount = parseAmount(input.amount);
    const occurredAt = parseDateTime(input.occurredAt);
    const sourceAccountId = parseOptionalId(
      input.sourceAccountId,
      'sourceAccountId',
    );
    const destinationAccountId = parseOptionalId(
      input.destinationAccountId,
      'destinationAccountId',
    );
    const categoryId = parseOptionalId(input.categoryId, 'categoryId');
    const requestedName =
      typeof input.name === 'string' ? input.name.trim() : '';
    const note = typeof input.note === 'string' ? input.note.trim() : '';

    if (requestedName.length > MAX_TRANSACTION_NAME_LENGTH) {
      throw new Error('Transaction name is too long.');
    }

    if (note.length > MAX_TRANSACTION_NOTE_LENGTH) {
      throw new Error('Transaction note is too long.');
    }

    const name =
      requestedName ||
      this.defaultName(kind, categoryId);

    return {
      kind: kind as TransactionKind,
      amount,
      occurredAt,
      sourceAccountId,
      destinationAccountId,
      categoryId,
      name,
      note,
    };
  }

  private defaultName(
    kind: TransactionKind,
    categoryId: string | undefined,
  ): string {
    if (categoryId) {
      const category = this.categories.findById(categoryId);

      if (category) {
        return category.name;
      }
    }

    if (kind === 'transfer') {
      return '帳戶轉帳';
    }

    if (kind === 'credit_card_payment') {
      return '信用卡繳款';
    }

    return kind === 'income' ? '收入' : '支出';
  }
}

function parseMonth(
  yearInput: unknown,
  monthInput: unknown,
): { year: number; month: number } {
  if (
    typeof yearInput !== 'number' ||
    !Number.isSafeInteger(yearInput) ||
    yearInput < 1 ||
    yearInput > 9999
  ) {
    throw new Error('Transaction year is invalid.');
  }

  if (
    typeof monthInput !== 'number' ||
    !Number.isSafeInteger(monthInput) ||
    monthInput < 1 ||
    monthInput > 12
  ) {
    throw new Error('Transaction month is invalid.');
  }

  return { year: yearInput, month: monthInput };
}

function parseOffset(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error('Transaction offset is invalid.');
  }

  return value;
}

function parseAmount(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_TRANSACTION_AMOUNT_TWD
  ) {
    throw new Error('Transaction amount is outside the allowed range.');
  }

  return value;
}

function parseDateTime(value: unknown): string {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('Transaction occurredAt is invalid.');
  }

  return value;
}

function parseOptionalId(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 100
  ) {
    throw new Error(`Transaction ${field} is invalid.`);
  }

  return value;
}

function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 100
  ) {
    throw new Error('Financial transaction id is invalid.');
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
    throw new Error(`Financial transaction ${field} is invalid.`);
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
