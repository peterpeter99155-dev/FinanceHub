import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DATA_STATUSES,
  DataStatus,
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
} from '../domain/financial-item';
import type {
  FinancialItemDraft,
  FinancialItemSnapshot,
} from '../shared/financial-items';

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

const TYPE_LABELS = Object.fromEntries(
  Object.values(TYPE_OPTIONS)
    .flat()
    .map(({ value, label }) => [value, label]),
) as Record<FinancialItemType, string>;

const STATUS_LABELS: Record<DataStatus, string> = {
  confirmed: '已確認',
  automatic: '自動更新',
  estimated: '推算',
  stale: '已過期',
  pending_confirmation: '待確認',
};

const EMPTY_DRAFT: FinancialItemDraft = {
  name: '',
  direction: 'asset',
  type: 'bank_deposit',
  amount: 0,
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
  const [draft, setDraft] = useState<FinancialItemDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const activeItems = useMemo(() => {
    if (viewState.status !== 'ready') {
      return [];
    }

    return viewState.snapshot.items.filter((item) => item.isActive);
  }, [viewState]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);

    try {
      const snapshot = editingId
        ? await window.financeHub.financialItems.update(editingId, draft)
        : await window.financeHub.financialItems.create(draft);

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
      amount: item.amount,
      status: item.status,
      includeInNetWorth: item.includeInNetWorth,
    });
    setActionError(null);
  }

  async function deactivateItem(item: FinancialItem) {
    const accepted = window.confirm(
      `停用「${item.name}」？資料會保留，但不再計入淨資產。`,
    );

    if (!accepted) {
      return;
    }

    setActionError(null);
    try {
      const snapshot =
        await window.financeHub.financialItems.deactivate(item.id);
      setViewState({ status: 'ready', snapshot });
      if (editingId === item.id) {
        resetForm();
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function changeDirection(direction: FinancialItemDirection) {
    setDraft((current) => ({
      ...current,
      direction,
      type: TYPE_OPTIONS[direction][0].value,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setActionError(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LOCAL-FIRST FINANCE</p>
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
          <section className="summary-grid" aria-label="淨資產總覽">
            <SummaryCard
              label="淨資產"
              value={viewState.snapshot.summary.netWorth}
              featured
              testId="net-worth"
            />
            <SummaryCard
              label="總資產"
              value={viewState.snapshot.summary.totalAssets}
              testId="total-assets"
            />
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
                  <p className="label">PORTFOLIO</p>
                  <h2>資產與負債</h2>
                </div>
                <span>{activeItems.length} 個啟用項目</span>
              </div>

              {activeItems.length === 0 ? (
                <div className="empty-state">
                  <strong>尚未建立財務項目</strong>
                  <p>從右側表單加入第一筆假資料，首頁會立即計算。</p>
                </div>
              ) : (
                <div className="item-list">
                  {activeItems.map((item) => (
                    <article
                      className="item-row"
                      data-testid={`financial-item-${item.id}`}
                      key={item.id}
                    >
                      <div className={`direction-dot ${item.direction}`} />
                      <div className="item-main">
                        <strong>{item.name}</strong>
                        <span>
                          {TYPE_LABELS[item.type]} ·{' '}
                          {STATUS_LABELS[item.status]}
                          {!item.includeInNetWorth && ' · 不計入'}
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
                          onClick={() => startEditing(item)}
                        >
                          編輯
                        </button>
                        <button
                          className="text-button danger"
                          type="button"
                          onClick={() => void deactivateItem(item)}
                        >
                          停用
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <p className="label">MANUAL ENTRY</p>
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
                  名稱
                  <input
                    data-testid="item-name"
                    required
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
                    min="0"
                    step="1"
                    type="number"
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        amount: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label>
                  資料狀態
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
                  計入淨資產
                </label>

                {draft.status === 'pending_confirmation' && (
                  <p className="form-notice">
                    待確認項目不會影響正式淨資產合計。
                  </p>
                )}
                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}

                <button
                  className="primary-button"
                  data-testid="save-item"
                  disabled={isSaving}
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

function formatTwd(value: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失敗，請稍後再試。';
}
