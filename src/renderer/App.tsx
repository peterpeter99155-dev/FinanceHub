import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DATA_STATUSES,
  DataStatus,
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
  MAX_FINANCIAL_ITEM_AMOUNT_TWD,
} from '../domain/financial-item';
import type {
  FinancialItemDraft,
  FinancialItemSnapshot,
} from '../shared/financial-items';
import { FINANCIAL_ITEM_TYPE_LABELS } from '../shared/financial-item-labels';

const TYPE_OPTIONS: Record<
  FinancialItemDirection,
  readonly { value: FinancialItemType; label: string }[]
> = {
  asset: [
    { value: 'bank_deposit', label: '銀行存款' },
    { value: 'cash', label: '現金' },
    { value: 'property', label: '房產' },
    { value: 'custom_asset', label: '自訂資產' },
  ],
  liability: [
    { value: 'credit_card', label: '信用卡負債' },
    { value: 'mortgage', label: '房貸' },
    { value: 'loan', label: '其他貸款' },
    { value: 'custom_liability', label: '自訂負債' },
  ],
};

const STATUS_LABELS: Record<DataStatus, string> = {
  confirmed: '我已確認金額正確',
  automatic: '由系統自動更新',
  estimated: '這是推算金額',
  stale: '資料可能已過期',
  pending_confirmation: '我之後再確認',
};

type FinancialItemFormDraft = Omit<FinancialItemDraft, 'amount'> & {
  amount: string;
};

const EMPTY_DRAFT: FinancialItemFormDraft = {
  name: '',
  direction: 'asset',
  type: 'bank_deposit',
  amount: '',
  status: 'confirmed',
  includeInNetWorth: true,
};

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: FinancialItemSnapshot }
  | { status: 'error'; message: string };

export function App() {
  const [viewState, setViewState] = useState<ViewState>({
    status: 'loading',
  });
  const [draft, setDraft] =
    useState<FinancialItemFormDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<FinancialItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const notificationTimerRef = useRef<number | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const snapshot = await window.financeHub.financialItems.list();
      setViewState({ status: 'ready', snapshot });
    } catch (error) {
      setViewState({
        status: 'error',
        message: getErrorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(
    () => () => {
      if (notificationTimerRef.current !== null) {
        window.clearTimeout(notificationTimerRef.current);
      }
    },
    [],
  );

  const activeItems = useMemo(() => {
    if (viewState.status !== 'ready') {
      return [];
    }

    return viewState.snapshot.items.filter((item) => item.isActive);
  }, [viewState]);
  const assetItems = useMemo(
    () => activeItems.filter((item) => item.direction === 'asset'),
    [activeItems],
  );
  const liabilityItems = useMemo(
    () =>
      activeItems.filter((item) => item.direction === 'liability'),
    [activeItems],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);

    try {
      const itemDraft: FinancialItemDraft = {
        ...draft,
        amount: Number(draft.amount),
      };
      const snapshot = editingId
        ? await window.financeHub.financialItems.update(
            editingId,
            itemDraft,
          )
        : await window.financeHub.financialItems.create(itemDraft);

      setViewState({ status: 'ready', snapshot });
      resetForm();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(item: FinancialItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      direction: item.direction,
      type: item.type,
      amount: String(item.amount),
      status: item.status,
      includeInNetWorth: item.includeInNetWorth,
    });
    setActionError(null);
  }

  async function confirmDeleteItem() {
    if (!pendingDeleteItem) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);
    try {
      const snapshot =
        await window.financeHub.financialItems.delete(
          pendingDeleteItem.id,
        );
      setViewState({ status: 'ready', snapshot });
      if (editingId === pendingDeleteItem.id) {
        resetForm();
      }
      setPendingDeleteItem(null);
      focusNameInput();
    } catch (error) {
      setActionError(getErrorMessage(error));
      setPendingDeleteItem(null);
      focusNameInput();
    } finally {
      setIsDeleting(false);
    }
  }

  function changeDirection(direction: FinancialItemDirection) {
    setDraft((current) => ({
      ...current,
      direction,
      type: TYPE_OPTIONS[direction][0].value,
    }));
  }

  function changeAmount(rawValue: string) {
    const digits = rawValue.replace(/\D/g, '');

    if (
      digits.length > 0 &&
      Number(digits) > MAX_FINANCIAL_ITEM_AMOUNT_TWD
    ) {
      showNotification(
        `單筆金額上限為 ${formatTwd(
          MAX_FINANCIAL_ITEM_AMOUNT_TWD,
        )}`,
      );
      return;
    }

    setDraft((current) => ({
      ...current,
      amount: digits,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setActionError(null);
  }

  function focusNameInput() {
    window.setTimeout(() => {
      window.focus();
      nameInputRef.current?.focus();
    }, 0);
  }

  function showNotification(message: string) {
    setNotification(message);

    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
    }

    notificationTimerRef.current = window.setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 3_000);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本機財務管理</p>
          <h1>FinanceHub</h1>
        </div>
        <span className="environment-badge">僅限假資料</span>
      </header>

      {viewState.status === 'loading' && (
        <section className="panel state-panel">正在載入財務資料…</section>
      )}

      {viewState.status === 'error' && (
        <section className="panel state-panel error-state">
          <h2>資料載入失敗</h2>
          <p>{viewState.message}</p>
          <button type="button" onClick={() => void loadItems()}>
            重新載入
          </button>
        </section>
      )}

      {viewState.status === 'ready' && (
        <>
          <section
            className="summary-equation"
            aria-label="淨資產等於總資產減去總負債"
            data-testid="summary-equation"
          >
            <SummaryCard
              label="淨資產"
              value={viewState.snapshot.summary.netWorth}
              featured
              testId="net-worth"
            />
            <span aria-hidden="true" className="equation-symbol">
              =
            </span>
            <SummaryCard
              label="總資產"
              value={viewState.snapshot.summary.totalAssets}
              testId="total-assets"
            />
            <span aria-hidden="true" className="equation-symbol">
              −
            </span>
            <SummaryCard
              label="總負債"
              value={viewState.snapshot.summary.totalLiabilities}
              testId="total-liabilities"
            />
          </section>

          <div className="workspace-grid">
            <section className="panel items-panel">
              <div className="section-heading">
                <div>
                  <p className="label">財務總覽</p>
                  <h2>資產與負債</h2>
                </div>
              </div>

              <div className="financial-groups">
                <FinancialItemGroup
                  direction="asset"
                  emptyMessage="尚未建立資產"
                  items={assetItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  title="資產"
                  total={viewState.snapshot.summary.totalAssets}
                />
                <FinancialItemGroup
                  direction="liability"
                  emptyMessage="尚未建立負債"
                  items={liabilityItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  title="負債"
                  total={viewState.snapshot.summary.totalLiabilities}
                />
              </div>
            </section>

            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <p className="label">手動新增</p>
                  <h2>{editingId ? '編輯項目' : '新增項目'}</h2>
                </div>
                {editingId && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={resetForm}
                  >
                    取消
                  </button>
                )}
              </div>

              <form onSubmit={(event) => void handleSubmit(event)}>
                <fieldset className="segmented-control">
                  <legend>方向</legend>
                  <button
                    className={
                      draft.direction === 'asset' ? 'selected' : ''
                    }
                    type="button"
                    onClick={() => changeDirection('asset')}
                  >
                    資產
                  </button>
                  <button
                    className={
                      draft.direction === 'liability' ? 'selected' : ''
                    }
                    type="button"
                    onClick={() => changeDirection('liability')}
                  >
                    負債
                  </button>
                </fieldset>

                <label>
                  名稱（選填）
                  <input
                    data-testid="item-name"
                    ref={nameInputRef}
                    maxLength={100}
                    value={draft.name}
                    placeholder="例如：示範銀行存款"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <small>
                    留空時會使用類型名稱，名稱可以重複。
                  </small>
                </label>

                <label>
                  類型
                  <select
                    data-testid="item-type"
                    value={draft.type}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        type: event.target.value as FinancialItemType,
                      }))
                    }
                  >
                    {TYPE_OPTIONS[draft.direction].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  目前金額（TWD）
                  <input
                    data-testid="item-amount"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    type="text"
                    value={draft.amount}
                    onChange={(event) => changeAmount(event.target.value)}
                  />
                  <small>
                    單筆最高 {formatTwd(MAX_FINANCIAL_ITEM_AMOUNT_TWD)}
                  </small>
                </label>
                {draft.amount === '0' && (
                  <p className="form-error" role="alert">
                    金額必須大於 0。
                  </p>
                )}

                <details
                  className="advanced-settings"
                  data-testid="advanced-settings"
                >
                  <summary>更多設定</summary>
                  <div className="advanced-content">
                    <label>
                      這筆金額的可信程度
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            status: event.target.value as DataStatus,
                          }))
                        }
                      >
                        {DATA_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      <small>
                        一般手動輸入維持「我已確認金額正確」即可。
                      </small>
                    </label>

                    <label className="checkbox-label">
                      <input
                        checked={draft.includeInNetWorth}
                        type="checkbox"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            includeInNetWorth: event.target.checked,
                          }))
                        }
                      />
                      {draft.direction === 'asset'
                        ? '列入我的資產'
                        : '列入我的負債'}
                    </label>
                    <p className="field-help">
                      關閉後只保留資料，不列入首頁總額。
                    </p>

                    {draft.status === 'pending_confirmation' && (
                      <p className="form-notice">
                        尚未確認的項目會保留，但不影響正式淨資產。
                      </p>
                    )}
                  </div>
                </details>
                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}

                <button
                  className="primary-button"
                  data-testid="save-item"
                  disabled={isSaving || draft.amount === '0'}
                  type="submit"
                >
                  {isSaving
                    ? '儲存中…'
                    : editingId
                      ? '儲存修改'
                      : '新增項目'}
                </button>
              </form>
            </section>
          </div>
        </>
      )}

      {pendingDeleteItem && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !isDeleting
            ) {
              setPendingDeleteItem(null);
              focusNameInput();
            }
          }}
          role="presentation"
        >
          <section
            aria-describedby="delete-dialog-description"
            aria-labelledby="delete-dialog-title"
            aria-modal="true"
            className="confirm-dialog"
            role="alertdialog"
          >
            <p className="label">確認刪除</p>
            <h2 id="delete-dialog-title">
              永久刪除「{pendingDeleteItem.name}」？
            </h2>
            <p id="delete-dialog-description">
              刪除後無法復原，這筆資料也不會再列入首頁總額。
            </p>
            <div className="dialog-actions">
              <button
                autoFocus
                className="secondary-button"
                disabled={isDeleting}
                type="button"
                onClick={() => {
                  setPendingDeleteItem(null);
                  focusNameInput();
                }}
              >
                取消
              </button>
              <button
                className="delete-button"
                disabled={isDeleting}
                type="button"
                onClick={() => void confirmDeleteItem()}
              >
                {isDeleting ? '刪除中…' : '永久刪除'}
              </button>
            </div>
          </section>
        </div>
      )}

      {notification && (
        <div className="toast-notification" role="status">
          {notification}
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  featured = false,
  testId,
}: {
  label: string;
  value: number;
  featured?: boolean;
  testId: string;
}) {
  return (
    <article
      className={`summary-card ${featured ? 'featured' : ''}`}
      data-testid={testId}
    >
      <span>{label}</span>
      <strong>{formatTwd(value)}</strong>
    </article>
  );
}

function FinancialItemGroup({
  direction,
  emptyMessage,
  items,
  onDelete,
  onEdit,
  title,
  total,
}: {
  direction: FinancialItemDirection;
  emptyMessage: string;
  items: readonly FinancialItem[];
  onDelete: (item: FinancialItem) => void;
  onEdit: (item: FinancialItem) => void;
  title: string;
  total: number;
}) {
  return (
    <section
      aria-labelledby={`${direction}-group-title`}
      className={`financial-group ${direction}`}
      data-testid={`${direction}-group`}
    >
      <header className="group-heading">
        <div>
          <span className={`group-marker ${direction}`} />
          <h3 id={`${direction}-group-title`}>{title}</h3>
        </div>
        <p>
          列入首頁 <strong>{formatTwd(total)}</strong>
        </p>
      </header>

      {items.length === 0 ? (
        <div className="group-empty">
          <strong>{emptyMessage}</strong>
          <span>可從右側表單新增。</span>
        </div>
      ) : (
        <div className="item-list">
          {items.map((item) => (
            <article
              className="item-row"
              data-testid={`financial-item-${item.id}`}
              key={item.id}
            >
              <div className={`direction-dot ${item.direction}`} />
              <div className="item-main">
                <strong>{item.name}</strong>
                <span>
                  {FINANCIAL_ITEM_TYPE_LABELS[item.type]} ·{' '}
                  {STATUS_LABELS[item.status]}
                  {!item.includeInNetWorth && ' · 不列入首頁'}
                </span>
              </div>
              <div className="item-value">
                <strong>{formatTwd(item.amount)}</strong>
                <time dateTime={item.updatedAt}>
                  {formatUpdatedAt(item.updatedAt)}
                </time>
              </div>
              <div className="row-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onEdit(item)}
                >
                  編輯
                </button>
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => onDelete(item)}
                >
                  刪除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatTwd(value: number): string {
  const formattedAmount = new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value);

  return `TWD ${formattedAmount}`;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '操作失敗，請稍後再試。';
  }

  if (error.message.includes('greater than zero')) {
    return '金額必須大於 0。';
  }

  if (
    error.message.includes('allowed maximum') ||
    error.message.includes('supported maximum') ||
    error.message.includes('safe integer')
  ) {
    return `單筆金額上限為 ${formatTwd(
      MAX_FINANCIAL_ITEM_AMOUNT_TWD,
    )}。`;
  }

  return '操作失敗，請確認輸入內容後再試。';
}
