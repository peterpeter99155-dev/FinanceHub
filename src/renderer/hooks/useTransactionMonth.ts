import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FinancialCategory } from '../../domain/category';
import {
  type FinancialItem,
  toTransactionAccount,
} from '../../domain/financial-item';
import {
  financialDateParts,
  shiftFinancialMonth,
} from '../../domain/financial-time';
import {
  type FinancialTransaction,
  type TransactionKind,
  hasInsufficientAccountBalance,
} from '../../domain/transaction';
import type { TransactionMonthSnapshot } from '../../shared/transactions';
import { systemClock } from '../../application/ports/clock';
import { transactionErrorMessage } from '../messages';
import {
  emptyDraft,
  groupTransactionsByDate,
  isoToLocalInput,
  toTransactionDraft,
  type TransactionFormDraft,
} from '../transactionViewModel';
import { useViewedMonth } from './useViewedMonth';

export function useTransactionMonth({
  accounts,
  onBalancesChanged,
  typeManagementVersion,
}: {
  accounts: readonly FinancialItem[];
  onBalancesChanged: () => Promise<void>;
  typeManagementVersion: number;
}) {
  const now = useMemo(() => systemClock.now(), []);
  const currentMonth = useMemo(() => financialDateParts(now), [now]);
  const { year, month, setYear, setMonth } = useViewedMonth(
    currentMonth.year,
    currentMonth.month,
  );
  const [snapshot, setSnapshot] =
    useState<TransactionMonthSnapshot | null>(null);
  const [categories, setCategories] = useState<
    readonly FinancialCategory[]
  >([]);
  const [draft, setDraft] = useState<TransactionFormDraft>(() =>
    emptyDraft(currentMonth.year, currentMonth.month, 'expense', now),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<FinancialTransaction | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formPanelRef = useRef<HTMLElement>(null);

  const loadMonth = useCallback(async () => {
    setError(null);
    try {
      const [loadedSnapshot, loadedCategories] = await Promise.all([
        window.financeHub.transactions.listMonth(year, month),
        window.financeHub.categories.list(),
      ]);
      setSnapshot(loadedSnapshot);
      setCategories(loadedCategories);
    } catch {
      setError('收支資料載入失敗，請稍後再試。');
    }
  }, [month, year]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth, typeManagementVersion]);

  const assetAccounts = accounts.filter((item) => {
    const account = toTransactionAccount(item);
    return account?.isActive && account.kind !== 'credit_card';
  });
  const relevantCategories = categories.filter(
    (category) =>
      category.isActive &&
      category.kind ===
        (draft.kind === 'income' ? 'income' : 'expense'),
  );
  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(snapshot?.items ?? []),
    [snapshot?.items],
  );
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const selectedExpenseAccount = assetAccounts.find(
    (account) => account.id === draft.sourceAccountId,
  );
  const hasInsufficientBalance = hasInsufficientAccountBalance(
    draft.kind,
    Number(draft.amount),
    selectedExpenseAccount
      ? toTransactionAccount(selectedExpenseAccount)
      : undefined,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const transactionDraft = toTransactionDraft(draft);
      const nextSnapshot = editingId
        ? await window.financeHub.transactions.update(
            editingId,
            transactionDraft,
            year,
            month,
          )
        : await window.financeHub.transactions.create(
            transactionDraft,
            year,
            month,
          );
      setSnapshot(nextSnapshot);
      await onBalancesChanged();
      resetForm(year, month, draft.kind);
    } catch (caughtError) {
      setError(transactionErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      setSnapshot(
        await window.financeHub.transactions.delete(
          pendingDelete.id,
          year,
          month,
        ),
      );
      if (editingId === pendingDelete.id) {
        resetForm();
      }
      setPendingDelete(null);
      await onBalancesChanged();
    } catch (caughtError) {
      setError(transactionErrorMessage(caughtError));
      setPendingDelete(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function loadMore() {
    if (!snapshot) {
      return;
    }
    try {
      const nextPage = await window.financeHub.transactions.listMonth(
        year,
        month,
        snapshot.items.length,
      );
      setSnapshot({
        ...nextPage,
        items: [...snapshot.items, ...nextPage.items],
      });
    } catch {
      setError('載入更多交易失敗。');
    }
  }

  function startEditing(transaction: FinancialTransaction) {
    setEditingId(transaction.id);
    setDraft({
      kind: transaction.kind,
      amount: String(transaction.amount),
      occurredAt: isoToLocalInput(transaction.occurredAt),
      sourceAccountId: transaction.sourceAccountId ?? '',
      destinationAccountId: transaction.destinationAccountId ?? '',
      categoryId: transaction.categoryId ?? '',
      name: transaction.name,
      note: transaction.note,
    });
    setError(null);
    window.setTimeout(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      formPanelRef.current
        ?.querySelector<HTMLInputElement>('input, select')
        ?.focus();
    }, 0);
  }

  function resetForm(
    targetYear = year,
    targetMonth = month,
    kind: TransactionKind = draft.kind,
  ) {
    setEditingId(null);
    setDraft(emptyDraft(targetYear, targetMonth, kind));
    setError(null);
  }

  function changeKind(kind: TransactionKind) {
    setDraft((current) => ({
      ...current,
      kind,
      sourceAccountId: '',
      destinationAccountId: '',
      categoryId: '',
    }));
  }

  function changeMonth(offset: number) {
    const next = shiftFinancialMonth(year, month, offset);
    setYear(next.year);
    setMonth(next.month);
    resetForm(next.year, next.month);
  }

  return {
    accountById,
    assetAccounts,
    changeKind,
    changeMonth,
    confirmDelete,
    currentMonth,
    draft,
    editingId,
    error,
    formPanelRef,
    groupedTransactions,
    hasInsufficientBalance,
    isSaving,
    loadMore,
    month,
    pendingDelete,
    relevantCategories,
    resetForm,
    setDraft,
    setError,
    setPendingDelete,
    snapshot,
    startEditing,
    submit,
    year,
  };
}
