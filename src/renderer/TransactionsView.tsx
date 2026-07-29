import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FinancialCategory } from '../domain/category';
import {
  FinancialItem,
  toTransactionAccount,
} from '../domain/financial-item';
import {
  FINANCIAL_TIME_ZONE,
  financialDateKey,
  financialDateParts,
  financialLocalDateTimeInput,
  financialLocalInputToIso,
  shiftFinancialMonth,
  viewedMonthLocalDateTime,
} from '../domain/financial-time';
import { systemClock } from '../application/ports/clock';
import {
  MAX_TRANSACTION_AMOUNT_TWD,
  FinancialTransaction,
  TransactionKind,
  calculateTransactionBalance,
  hasInsufficientAccountBalance,
} from '../domain/transaction';
import type {
  TransactionDraft,
  TransactionMonthSnapshot,
} from '../shared/transactions';
import {
  ERROR_CODES,
  errorCodeOf,
} from '../shared/errors';
import { IconButton } from './IconButton';
import { MoneyAmount } from './MoneyAmount';

const KIND_LABELS: Readonly<Record<TransactionKind, string>> = {
  income: '收入',
  expense: '支出',
  transfer: '帳戶轉帳',
  credit_card_purchase: '信用卡消費',
  credit_card_payment: '信用卡繳款',
};

interface TransactionFormDraft {
  kind: TransactionKind;
  amount: string;
  occurredAt: string;
  sourceAccountId: string;
  destinationAccountId: string;
  categoryId: string;
  name: string;
  note: string;
}

export function TransactionsView({
  accounts,
  onBalancesChanged,
  onCreateAccount,
  onOpenTypeManagement,
  typeManagementVersion,
}: {
  accounts: readonly FinancialItem[];
  onBalancesChanged: () => Promise<void>;
  onCreateAccount: () => void;
  onOpenTypeManagement: (section: 'income' | 'expense') => void;
  typeManagementVersion: number;
}) {
  const now = useMemo(() => systemClock.now(), []);
  const currentMonth = useMemo(() => financialDateParts(now), [now]);
  const [year, setYear] = useState(currentMonth.year);
  const [month, setMonth] = useState(currentMonth.month);
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

  const assetAccounts = accounts.filter(
    (item) => {
      const account = toTransactionAccount(item);
      return account?.isActive && account.kind !== 'credit_card';
    },
  );
  const activeCategories = categories.filter(
    (category) => category.isActive,
  );
  const relevantCategories = activeCategories.filter(
    (category) =>
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

  const isCurrentMonth =
    year === currentMonth.year && month === currentMonth.month;

  return (
    <section className="transactions-workspace">
      <div className="transaction-summary-row">
        <TransactionSummaryCard
          label="本月收入"
          value={snapshot?.summary.totalIncome ?? 0}
          tone="income"
        />
        <TransactionSummaryCard
          label="本月支出"
          value={snapshot?.summary.totalExpense ?? 0}
          tone="expense"
        />
        <TransactionSummaryCard
          label="收支差額"
          value={snapshot?.summary.balance ?? 0}
          tone="balance"
        />
      </div>

      <AccountOverview
        assetAccounts={assetAccounts}
        onCreateAccount={onCreateAccount}
      />

      <div className="transaction-grid">
        <section className="panel transaction-list-panel">
          <div className="section-heading">
            <div>
              <p className="label">交易流水</p>
              <h2>
                {year} 年 {month} 月
              </h2>
            </div>
            <div className="month-navigation">
              <button type="button" onClick={() => changeMonth(-1)}>
                上個月
              </button>
              <button
                disabled={isCurrentMonth}
                type="button"
                onClick={() => changeMonth(1)}
              >
                下個月
              </button>
            </div>
          </div>

          {!snapshot ? (
            <p className="transaction-empty">正在載入交易…</p>
          ) : snapshot.items.length === 0 ? (
            <p className="transaction-empty">這個月還沒有交易。</p>
          ) : (
            <div className="transaction-list">
              {groupedTransactions.map((group) => (
                <section className="transaction-day-group" key={group.key}>
                  <header className="transaction-day-heading">
                    <div>
                      <strong>{formatDateHeading(group.date)}</strong>
                      <span>{group.items.length} 筆交易</span>
                    </div>
                    <p className={dailyBalanceTone(group.balance)}>
                      當日收支{' '}
                      <strong>
                        <MoneyAmount
                          value={group.balance}
                          tone={
                            group.balance > 0
                              ? 'positive'
                              : group.balance < 0
                                ? 'negative'
                                : 'neutral'
                          }
                          sign={
                            group.balance > 0 ? 'positive' : 'auto'
                          }
                        />
                      </strong>
                    </p>
                  </header>
                  {group.items.map((transaction) => (
                    <article
                      className={`transaction-row ${
                        editingId === transaction.id ? 'editing' : ''
                      }`}
                      key={transaction.id}
                    >
                      <span
                        className={`transaction-kind ${transaction.kind}`}
                      >
                        {simpleKindLabel(transaction.kind)}
                      </span>
                      <div>
                        <strong>
                          {transaction.name}
                          {editingId === transaction.id && (
                            <span className="editing-badge">編輯中</span>
                          )}
                        </strong>
                        {transactionAccountFlow(
                          transaction,
                          accountById,
                        ) && (
                          <span className="transaction-account-flow">
                            {transactionAccountFlow(
                              transaction,
                              accountById,
                            )}
                          </span>
                        )}
                        {transaction.note && (
                          <span
                            className="transaction-note"
                            title={transaction.note}
                          >
                            備註：{transaction.note}
                          </span>
                        )}
                        <time dateTime={transaction.occurredAt}>
                          {formatTime(transaction.occurredAt)}
                        </time>
                      </div>
                      <strong
                        className={`transaction-amount ${transactionTone(
                          transaction.kind,
                        )}`}
                      >
                        <MoneyAmount
                          value={transaction.amount}
                          tone={transactionTone(transaction.kind)}
                          sign={
                            transaction.kind === 'income'
                              ? 'positive'
                              : transaction.kind === 'expense' ||
                                  transaction.kind ===
                                    'credit_card_purchase'
                                ? 'negative'
                                : 'none'
                          }
                        />
                      </strong>
                      <div className="row-actions">
                        {isSimpleKind(transaction.kind) && (
                          <IconButton
                            icon="edit"
                            label={`編輯 ${transaction.name}`}
                            type="button"
                            onClick={() => startEditing(transaction)}
                          />
                        )}
                        <IconButton
                          icon="delete"
                          label={`刪除 ${transaction.name}`}
                          type="button"
                          onClick={() => setPendingDelete(transaction)}
                        />
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}

          {snapshot &&
            snapshot.items.length < snapshot.totalCount && (
              <button
                className="load-more-button"
                type="button"
                onClick={() => void loadMore()}
              >
                載入更多
              </button>
            )}
        </section>

        <section
          className={`panel transaction-form-panel ${
            editingId ? 'editing' : ''
          }`}
          ref={formPanelRef}
        >
          <div className="section-heading">
            <div>
              <p className="label">
                {editingId ? '編輯模式' : '手動記錄'}
              </p>
              <h2>
                {editingId
                  ? `正在編輯：${draft.name || KIND_LABELS[draft.kind]}`
                  : '新增交易'}
              </h2>
            </div>
            {editingId && (
              <IconButton
                icon="close"
                label="取消編輯"
                type="button"
                onClick={() => resetForm()}
              />
            )}
          </div>

          <form onSubmit={(event) => void submit(event)}>
            <label>
              交易類型
              <select
                data-testid="transaction-kind"
                value={draft.kind === 'income' ? 'income' : 'expense'}
                onChange={(event) =>
                  changeKind(event.target.value as TransactionKind)
                }
              >
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </label>

            <TransactionAccountFields
              assetAccounts={assetAccounts}
              draft={draft}
              onChange={setDraft}
            />

            {hasInsufficientBalance && (
              <div className="account-required-notice">
                <strong>所選帳戶的帳面餘額不足</strong>
                <span>
                  您仍可記錄這筆支出，請改成不指定扣款帳戶。
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      sourceAccountId: '',
                    }))
                  }
                >
                  改成不指定帳戶
                </button>
              </div>
            )}

            {(draft.kind === 'income' ||
              draft.kind === 'expense' ||
              draft.kind === 'credit_card_purchase') && (
              <label>
                <span className="field-heading">
                  分類
                  <button
                    className="inline-action"
                    type="button"
                    onClick={() =>
                      onOpenTypeManagement(
                        draft.kind === 'income' ? 'income' : 'expense',
                      )
                    }
                  >
                    ＋新增分類
                  </button>
                </span>
                <select
                  data-testid="transaction-category"
                  required
                  value={draft.categoryId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">請選擇分類</option>
                  {relevantCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              金額（TWD）
              <input
                data-testid="transaction-amount"
                inputMode="numeric"
                maxLength={12}
                pattern="[0-9]*"
                placeholder="0"
                required
                type="text"
                value={draft.amount}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '');
                  if (
                    digits &&
                    Number(digits) > MAX_TRANSACTION_AMOUNT_TWD
                  ) {
                    setError(
                      `單筆金額上限為 ${formatTwd(
                        MAX_TRANSACTION_AMOUNT_TWD,
                      )}。`,
                    );
                    return;
                  }
                  setDraft((current) => ({ ...current, amount: digits }));
                }}
              />
            </label>

            <label>
              交易時間
              <input
                max={financialLocalDateTimeInput(systemClock.now())}
                required
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    occurredAt: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              名稱（選填）
              <input
                maxLength={50}
                placeholder="留空時使用分類名稱"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              備註（選填）
              <textarea
                maxLength={200}
                rows={3}
                value={draft.note}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="primary-button"
              data-testid="save-transaction"
              disabled={
                isSaving ||
                draft.amount === '0' ||
                hasInsufficientBalance
              }
              type="submit"
            >
              {isSaving
                ? '儲存中…'
                : editingId
                  ? '儲存修改'
                  : '新增交易'}
            </button>
          </form>
        </section>
      </div>

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-modal="true"
            className="confirm-dialog"
            role="alertdialog"
          >
            <p className="label">確認刪除</p>
            <h2>刪除「{pendingDelete.name}」？</h2>
            <p>帳戶餘額及本月統計會自動還原。</p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                className="delete-button"
                type="button"
                onClick={() => void confirmDelete()}
              >
                刪除交易
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function TransactionAccountFields({
  assetAccounts,
  draft,
  onChange,
}: {
  assetAccounts: readonly FinancialItem[];
  draft: TransactionFormDraft;
  onChange: (
    updater: (current: TransactionFormDraft) => TransactionFormDraft,
  ) => void;
}) {
  if (draft.kind === 'income') {
    return (
      <label>
        入帳帳戶（選填）
        <AccountSelect
          accounts={assetAccounts}
          value={draft.destinationAccountId}
          onChange={(value) =>
            onChange((current) => ({
              ...current,
              destinationAccountId: value,
            }))
          }
        />
      </label>
    );
  }

  return (
    <label>
      扣款帳戶（選填）
      <AccountSelect
        accounts={assetAccounts}
        value={draft.sourceAccountId}
        onChange={(value) =>
          onChange((current) => ({
            ...current,
            kind: 'expense',
            sourceAccountId: value,
            destinationAccountId: '',
          }))
        }
      />
    </label>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly FinancialItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        不指定帳戶
      </option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}（{formatTwd(account.amount)}）
        </option>
      ))}
    </select>
  );
}

function AccountOverview({
  assetAccounts,
  onCreateAccount,
}: {
  assetAccounts: readonly FinancialItem[];
  onCreateAccount: () => void;
}) {
  const overviewAccounts = assetAccounts;

  return (
    <section className="account-overview" aria-label="帳戶概況">
      <header>
        <h3>可用餘額</h3>
      </header>
      {overviewAccounts.length === 0 ? (
        <div className="account-overview-empty">
          <div>
            <strong>尚未建立可收付款的帳戶</strong>
            <span>請先新增銀行帳戶或現金。</span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onCreateAccount}
          >
            新增帳戶
          </button>
        </div>
      ) : (
        <div className="account-overview-list">
          {overviewAccounts.map((account) => (
            <article key={account.id}>
              <span>{account.name}</span>
              <strong
                className={
                  account.amount > 0
                    ? 'financial-positive'
                    : 'financial-neutral'
                }
              >
                <MoneyAmount
                  value={account.amount}
                  tone={account.amount > 0 ? 'positive' : 'neutral'}
                />
              </strong>
              <small>帳面餘額</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TransactionSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'balance';
}) {
  const balanceTone =
    tone === 'balance'
      ? value > 0
        ? 'positive'
        : value < 0
          ? 'negative'
          : 'neutral'
      : '';

  return (
    <article
      className={`transaction-summary-card ${tone} ${balanceTone}`}
    >
      <span>{label}</span>
      <strong>
        <MoneyAmount
          value={value}
          tone={
            tone === 'income'
              ? 'positive'
              : tone === 'expense'
                ? 'negative'
                : value > 0
                  ? 'positive'
                  : value < 0
                    ? 'negative'
                    : 'neutral'
          }
          sign={
            tone === 'income' && value > 0
              ? 'positive'
              : tone === 'expense' && value > 0
                ? 'negative'
                : tone === 'balance' && value > 0
                  ? 'positive'
                  : 'auto'
          }
        />
      </strong>
    </article>
  );
}

function emptyDraft(
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

function isSimpleKind(kind: TransactionKind): boolean {
  return kind === 'income' || kind === 'expense';
}

function simpleKindLabel(kind: TransactionKind): string {
  if (kind === 'income') {
    return '收入';
  }

  if (kind === 'expense' || kind === 'credit_card_purchase') {
    return '支出';
  }

  return KIND_LABELS[kind];
}

function transactionTone(
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

interface TransactionDateGroup {
  readonly key: string;
  readonly date: string;
  readonly items: readonly FinancialTransaction[];
  readonly balance: number;
}

function groupTransactionsByDate(
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

function dailyBalanceTone(balance: number): string {
  if (balance > 0) {
    return 'daily-balance positive';
  }

  if (balance < 0) {
    return 'daily-balance negative';
  }

  return 'daily-balance neutral';
}

function transactionAccountFlow(
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

function toTransactionDraft(
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

function isoToLocalInput(value: string): string {
  return financialLocalDateTimeInput(value);
}

function formatDateHeading(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: FINANCIAL_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(Date.parse(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: FINANCIAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(Date.parse(value));
}

function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function transactionErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);

  if (code === ERROR_CODES.futureTransaction) {
    return '交易時間不能晚於現在。';
  }

  if (code === ERROR_CODES.negativeAccountBalance) {
    return '帳戶餘額不足，無法完成這筆交易。';
  }

  if (code === ERROR_CODES.invalidCategory) {
    return '請選擇正確的收入或支出分類。';
  }

  if (code === ERROR_CODES.invalidAccount) {
    return '請選擇正確的收款、付款或信用卡帳戶。';
  }

  return '交易儲存失敗，請確認輸入內容。';
}
