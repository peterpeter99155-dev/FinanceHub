import type { FinancialItem } from '../domain/financial-item';
import {
  FINANCIAL_TIME_ZONE,
  financialDateKey,
  financialLocalDateTimeInput,
  financialLocalInputToIso,
  viewedMonthLocalDateTime,
} from '../domain/financial-time';
import {
  calculateTransactionBalance,
  type FinancialTransaction,
  type TransactionKind,
} from '../domain/transaction';
import type { TransactionDraft } from '../shared/transactions';
import { systemClock } from '../application/ports/clock';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface TransactionFormDraft {
  kind: TransactionKind;
  amount: string;
  occurredAt: string;
  sourceAccountId: string;
  destinationAccountId: string;
  categoryId: string;
  name: string;
  note: string;
}

export interface TransactionDateGroup {
  readonly key: string;
  readonly date: string;
  readonly items: readonly FinancialTransaction[];
  readonly balance: number;
}

export function emptyDraft(
  year: number,
  month: number,
  kind: TransactionKind = 'expense',
  now: string = systemClock.now(),
): TransactionFormDraft {
  return {
    kind,
    amount: '',
    occurredAt: viewedMonthLocalDateTime(year, month, now),
    sourceAccountId: '',
    destinationAccountId: '',
    categoryId: '',
    name: '',
    note: '',
  };
}

export function isSimpleKind(kind: TransactionKind): boolean {
  return kind === 'income' || kind === 'expense';
}

export function simpleKindLabel(kind: TransactionKind): string {
  if (kind === 'income') {
    return '收入';
  }
  if (kind === 'expense' || kind === 'credit_card_purchase') {
    return '支出';
  }
  return TRANSACTION_KIND_LABELS[kind];
}

export function transactionTone(
  kind: TransactionKind,
): 'positive' | 'negative' | 'neutral' {
  if (kind === 'income') {
    return 'positive';
  }
  if (kind === 'expense' || kind === 'credit_card_purchase') {
    return 'negative';
  }
  return 'neutral';
}

export function groupTransactionsByDate(
  transactions: readonly FinancialTransaction[],
): readonly TransactionDateGroup[] {
  const groups = new Map<string, FinancialTransaction[]>();
  for (const transaction of transactions) {
    const key = financialDateKey(transaction.occurredAt);
    const existing = groups.get(key);
    if (existing) {
      existing.push(transaction);
    } else {
      groups.set(key, [transaction]);
    }
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    date: items[0].occurredAt,
    items,
    balance: calculateTransactionBalance(items),
  }));
}

export function dailyBalanceTone(balance: number): string {
  return balance > 0
    ? 'daily-balance positive'
    : balance < 0
      ? 'daily-balance negative'
      : 'daily-balance neutral';
}

export function transactionAccountFlow(
  transaction: FinancialTransaction,
  accounts: ReadonlyMap<string, FinancialItem>,
): string {
  const source =
    transaction.sourceAccountId &&
    accounts.get(transaction.sourceAccountId)?.name;
  const destination =
    transaction.destinationAccountId &&
    accounts.get(transaction.destinationAccountId)?.name;

  switch (transaction.kind) {
    case 'income':
      return destination ? `入帳至 ${destination}` : '';
    case 'expense':
      return source ? `從 ${source} 扣款` : '';
    case 'transfer':
      return `${source ?? '未知帳戶'} → ${destination ?? '未知帳戶'}`;
    case 'credit_card_purchase':
      return `計入 ${destination ?? '未知信用卡'} 待繳`;
    case 'credit_card_payment':
      return `${source ?? '未知帳戶'} → ${destination ?? '未知信用卡'}`;
  }
}

export function toTransactionDraft(
  draft: TransactionFormDraft,
): TransactionDraft {
  return {
    kind: draft.kind,
    amount: Number(draft.amount),
    occurredAt: financialLocalInputToIso(draft.occurredAt),
    sourceAccountId: draft.sourceAccountId || undefined,
    destinationAccountId: draft.destinationAccountId || undefined,
    categoryId: draft.categoryId || undefined,
    name: draft.name,
    note: draft.note,
  };
}

export function isoToLocalInput(value: string): string {
  return financialLocalDateTimeInput(value);
}

export function formatDateHeading(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: FINANCIAL_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(Date.parse(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: FINANCIAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(Date.parse(value));
}

export function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
