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
import type { FinancialItemCustomType } from '../domain/financial-item-custom-type';
import type {
  CategoryKind,
  FinancialCategory,
} from '../domain/category';
import type {
  FinancialItemDraft,
  FinancialItemSnapshot,
} from '../shared/financial-items';
import { FINANCIAL_ITEM_TYPE_LABELS } from '../shared/financial-item-labels';
import {
  ERROR_CODES,
  errorCodeOf,
} from '../shared/errors';
import { TransactionsView } from './TransactionsView';
import { IconButton } from './IconButton';
import { MoneyAmount } from './MoneyAmount';

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
  const [customTypes, setCustomTypes] = useState<
    readonly FinancialItemCustomType[]
  >([]);
  const [categories, setCategories] = useState<
    readonly FinancialCategory[]
  >([]);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [managementSection, setManagementSection] = useState<
    'asset_type' | 'liability_type' | 'income' | 'expense'
  >('asset_type');
  const [managementError, setManagementError] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<'assets' | 'transactions'>(
    'assets',
  );
  const [typeManagementVersion, setTypeManagementVersion] = useState(0);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formPanelRef = useRef<HTMLElement>(null);
  const notificationTimerRef = useRef<number | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const [snapshot, loadedCustomTypes] = await Promise.all([
        window.financeHub.financialItems.list(),
        window.financeHub.financialItemCustomTypes.list(),
      ]);
      setViewState({ status: 'ready', snapshot });
      setCustomTypes(loadedCustomTypes);
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
      resetForm(draft.direction);
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
      customTypeId: item.customTypeId,
      amount: String(item.amount),
      status: item.status,
      includeInNetWorth: item.includeInNetWorth,
    });
    setActionError(null);
    window.setTimeout(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      nameInputRef.current?.focus();
    }, 0);
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
      customTypeId: undefined,
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

  function resetForm(
    direction: FinancialItemDirection = draft.direction,
  ) {
    setEditingId(null);
    setDraft({
      ...EMPTY_DRAFT,
      direction,
      type: TYPE_OPTIONS[direction][0].value,
    });
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

  async function openManagement(
    section:
      | 'asset_type'
      | 'liability_type'
      | 'income'
      | 'expense',
  ) {
    setManagementSection(section);
    setManagementError(null);

    try {
      const [loadedCustomTypes, loadedCategories] = await Promise.all([
        window.financeHub.financialItemCustomTypes.list(),
        window.financeHub.categories.list(),
      ]);
      setCustomTypes(loadedCustomTypes);
      setCategories(loadedCategories);
      setIsManagementOpen(true);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function changeItemType(value: string) {
    if (value.startsWith('custom:')) {
      setDraft((current) => ({
        ...current,
        type:
          current.direction === 'asset'
            ? 'custom_asset'
            : 'custom_liability',
        customTypeId: value.slice('custom:'.length),
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      type: value as FinancialItemType,
      customTypeId: undefined,
    }));
  }

  function itemTypeLabel(item: FinancialItem): string {
    if (item.customTypeId) {
      return (
        customTypes.find((type) => type.id === item.customTypeId)?.name ??
        FINANCIAL_ITEM_TYPE_LABELS[item.type]
      );
    }

    return FINANCIAL_ITEM_TYPE_LABELS[item.type];
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
          <nav className="primary-tabs" aria-label="主要功能">
            <button
              className={activeView === 'assets' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('assets')}
            >
              資產與負債
            </button>
            <button
              className={activeView === 'transactions' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('transactions')}
            >
              收支紀錄
            </button>
          </nav>

          {activeView === 'assets' ? (
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
              tone={financialTone(viewState.snapshot.summary.netWorth)}
              testId="net-worth"
            />
            <span aria-hidden="true" className="equation-symbol">
              =
            </span>
            <SummaryCard
              label="總資產"
              value={viewState.snapshot.summary.totalAssets}
              tone={
                viewState.snapshot.summary.totalAssets > 0
                  ? 'positive'
                  : 'neutral'
              }
              testId="total-assets"
            />
            <span aria-hidden="true" className="equation-symbol">
              −
            </span>
            <SummaryCard
              label="總負債"
              value={viewState.snapshot.summary.totalLiabilities}
              tone={
                viewState.snapshot.summary.totalLiabilities > 0
                  ? 'negative'
                  : 'neutral'
              }
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
                  editingId={editingId}
                  emptyMessage="尚未建立資產"
                  items={assetItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  typeLabel={itemTypeLabel}
                  title="資產"
                  total={viewState.snapshot.summary.totalAssets}
                />
                <FinancialItemGroup
                  direction="liability"
                  editingId={editingId}
                  emptyMessage="尚未建立負債"
                  items={liabilityItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  typeLabel={itemTypeLabel}
                  title="負債"
                  total={viewState.snapshot.summary.totalLiabilities}
                />
              </div>
            </section>

            <section
              className={`panel form-panel ${
                editingId ? 'editing' : ''
              }`}
              ref={formPanelRef}
            >
              <div className="section-heading">
                <div>
                  <p className="label">
                    {editingId ? '編輯模式' : '手動新增'}
                  </p>
                  <h2>
                    {editingId
                      ? `正在編輯：${draft.name}`
                      : '新增項目'}
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
                  <span className="field-heading">
                    類型
                    <button
                      className="inline-action"
                      type="button"
                      onClick={() =>
                        void openManagement(
                          draft.direction === 'asset'
                            ? 'asset_type'
                            : 'liability_type',
                        )
                      }
                    >
                      ＋新增類型
                    </button>
                  </span>
                  <select
                    data-testid="item-type"
                    value={
                      draft.customTypeId
                        ? `custom:${draft.customTypeId}`
                        : draft.type
                    }
                    onChange={(event) =>
                      changeItemType(event.target.value)
                    }
                  >
                    {draft.type === 'credit_card' && (
                      <option value="credit_card">信用卡（既有）</option>
                    )}
                    {TYPE_OPTIONS[draft.direction].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {customTypes
                      .filter(
                        (type) =>
                          type.direction === draft.direction &&
                          type.isActive,
                      )
                      .map((type) => (
                        <option
                          key={type.id}
                          value={`custom:${type.id}`}
                        >
                          {type.name}
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
          ) : (
            <TransactionsView
              accounts={viewState.snapshot.items}
              onBalancesChanged={loadItems}
              onCreateAccount={() => {
                setActiveView('assets');
                setEditingId(null);
                setDraft({
                  ...EMPTY_DRAFT,
                  direction: 'asset',
                  type: 'bank_deposit',
                });
                focusNameInput();
              }}
              onOpenTypeManagement={(section) =>
                void openManagement(section)
              }
              typeManagementVersion={typeManagementVersion}
            />
          )}
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

      {isManagementOpen && (
        <ManagementDialog
          categories={categories}
          customTypes={customTypes}
          error={managementError}
          section={managementSection}
          onCategoriesChange={setCategories}
          onClose={() => {
            setIsManagementOpen(false);
            setManagementError(null);
            setTypeManagementVersion((current) => current + 1);
          }}
          onCustomTypesChange={setCustomTypes}
          onError={setManagementError}
          onSaved={() =>
            showNotification(
              managementSection === 'asset_type' ||
                managementSection === 'liability_type'
                ? '✓ 類型名稱已儲存'
                : '✓ 分類名稱已儲存',
            )
          }
          onSectionChange={setManagementSection}
        />
      )}

      {notification && (
        <div
          className={`toast-notification ${
            isManagementOpen ? 'near-dialog' : ''
          }`}
          role="status"
        >
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
  tone = 'neutral',
  testId,
}: {
  label: string;
  value: number;
  featured?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
  testId: string;
}) {
  return (
    <article
      className={`summary-card ${featured ? 'featured' : ''} ${tone}`}
      data-testid={testId}
    >
      <span>{label}</span>
      <strong>
        <MoneyAmount value={value} tone={tone} />
      </strong>
    </article>
  );
}

function FinancialItemGroup({
  direction,
  editingId,
  emptyMessage,
  items,
  onDelete,
  onEdit,
  typeLabel,
  title,
  total,
}: {
  direction: FinancialItemDirection;
  editingId: string | null;
  emptyMessage: string;
  items: readonly FinancialItem[];
  onDelete: (item: FinancialItem) => void;
  onEdit: (item: FinancialItem) => void;
  typeLabel: (item: FinancialItem) => string;
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
          列入首頁{' '}
          <strong>
            <MoneyAmount
              value={total}
              tone={direction === 'asset' ? 'positive' : 'negative'}
            />
          </strong>
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
              className={`item-row ${
                editingId === item.id ? 'editing' : ''
              }`}
              data-testid={`financial-item-${item.id}`}
              key={item.id}
            >
              <div className={`direction-dot ${item.direction}`} />
              <div className="item-main">
                <strong>
                  {item.name}
                  {editingId === item.id && (
                    <span className="editing-badge">編輯中</span>
                  )}
                </strong>
                <span>
                  {typeLabel(item)} ·{' '}
                  {STATUS_LABELS[item.status]}
                  {!item.includeInNetWorth && ' · 不列入首頁'}
                </span>
              </div>
              <div
                className={`item-value ${
                  item.direction === 'asset' ? 'positive' : 'negative'
                }`}
              >
                <strong>
                  <MoneyAmount
                    value={item.amount}
                    tone={
                      item.direction === 'asset'
                        ? 'positive'
                        : 'negative'
                    }
                  />
                </strong>
                <time dateTime={item.updatedAt}>
                  {formatUpdatedAt(item.updatedAt)}
                </time>
              </div>
              <div className="row-actions">
                <IconButton
                  icon="edit"
                  label={`編輯 ${item.name}`}
                  type="button"
                  onClick={() => onEdit(item)}
                />
                <IconButton
                  icon="delete"
                  label={`刪除 ${item.name}`}
                  type="button"
                  onClick={() => onDelete(item)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ManagementDialog({
  categories,
  customTypes,
  error,
  section,
  onCategoriesChange,
  onClose,
  onCustomTypesChange,
  onError,
  onSaved,
  onSectionChange,
}: {
  categories: readonly FinancialCategory[];
  customTypes: readonly FinancialItemCustomType[];
  error: string | null;
  section: 'asset_type' | 'liability_type' | 'income' | 'expense';
  onCategoriesChange: (
    categories: readonly FinancialCategory[],
  ) => void;
  onClose: () => void;
  onCustomTypesChange: (
    types: readonly FinancialItemCustomType[],
  ) => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  onSectionChange: (
    section: 'asset_type' | 'liability_type' | 'income' | 'expense',
  ) => void;
}) {
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isTypeSection =
    section === 'asset_type' || section === 'liability_type';
  const direction: FinancialItemDirection =
    section === 'liability_type' ? 'liability' : 'asset';
  const categoryKind: CategoryKind =
    section === 'income' ? 'income' : 'expense';
  const entries = isTypeSection
    ? customTypes.filter((type) => type.direction === direction)
    : categories.filter(
        (category) =>
          category.kind === categoryKind && !category.isBuiltIn,
      );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function createEntry() {
    const name = newName.trim();

    if (!name) {
      onError('請輸入名稱。');
      return;
    }

    setIsSaving(true);
    onError(null);

    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.create({
            direction,
            name,
            isActive: true,
          }),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.create({
            kind: categoryKind,
            name,
            isActive: true,
          }),
        );
      }
      setNewName('');
    } catch (caughtError) {
      onError(
        managementErrorMessage(
          caughtError,
          isTypeSection ? '類型' : '分類',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateEntry(
    entry: FinancialItemCustomType | FinancialCategory,
    name: string,
    isActive: boolean,
  ): Promise<boolean> {
    onError(null);

    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.update(
            entry.id,
            {
              direction,
              name,
              isActive,
            },
          ),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.update(entry.id, {
            kind: categoryKind,
            name,
            isActive,
          }),
        );
      }
      return true;
    } catch (caughtError) {
      onError(
        managementErrorMessage(
          caughtError,
          isTypeSection ? '類型' : '分類',
        ),
      );
      return false;
    }
  }

  async function deleteEntry(
    entry: FinancialItemCustomType | FinancialCategory,
  ) {
    onError(null);

    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.delete(
            entry.id,
          ),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.delete(entry.id),
        );
      }
    } catch {
      onError(
        isTypeSection
          ? '這個類型已有資產或負債使用，不能停用或刪除。'
          : '這個分類已被交易使用，請先將交易移至其他分類。',
      );
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="management-dialog-title"
        aria-modal="true"
        className="management-dialog"
        role="dialog"
      >
        <div className="section-heading">
          <div>
            <p className="label">自訂設定</p>
            <h2 id="management-dialog-title">管理類型與分類</h2>
          </div>
          <button
            aria-label="關閉"
            className="dialog-close-button"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="management-tabs" role="tablist">
          {(
            [
              ['asset_type', '資產類型'],
              ['liability_type', '負債類型'],
              ['income', '收入分類'],
              ['expense', '支出分類'],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-selected={section === value}
              className={section === value ? 'selected' : ''}
              key={value}
              role="tab"
              type="button"
              onClick={() => {
                setNewName('');
                onError(null);
                onSectionChange(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="management-create">
          <input
            aria-label="新名稱"
            maxLength={20}
            placeholder={
              isTypeSection ? '輸入新的類型名稱' : '輸入新的分類名稱'
            }
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void createEntry();
              }
            }}
          />
          <button
            className="primary-button"
            disabled={isSaving}
            type="button"
            onClick={() => void createEntry()}
          >
            新增
          </button>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="management-list">
          {entries.length === 0 ? (
            <p className="management-empty">目前沒有自訂項目。</p>
          ) : (
            entries.map((entry) => (
              <ManagementRow
                entry={entry}
                key={entry.id}
                onDelete={() => void deleteEntry(entry)}
                onSaved={onSaved}
                onUpdate={(name, isActive) =>
                  updateEntry(entry, name, isActive)
                }
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ManagementRow({
  entry,
  onDelete,
  onSaved,
  onUpdate,
}: {
  entry: FinancialItemCustomType | FinancialCategory;
  onDelete: () => void;
  onSaved: () => void;
  onUpdate: (name: string, isActive: boolean) => Promise<boolean>;
}) {
  const [name, setName] = useState(entry.name);
  const [, setSaveState] = useState<'idle' | 'saving'>('idle');
  const autoSaveTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    },
    [],
  );

  async function saveName(candidate: string) {
    const normalizedName = candidate.trim();

    if (!normalizedName || normalizedName === entry.name) {
      return;
    }

    setSaveState('saving');
    const succeeded = await onUpdate(normalizedName, entry.isActive);

    if (!succeeded) {
      setName(entry.name);
      setSaveState('idle');
      return;
    }

    setName(normalizedName);
    setSaveState('idle');
    onSaved();
  }

  function scheduleSave(candidate: string) {
    setName(candidate);
    setSaveState('idle');

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    if (!candidate.trim() || candidate.trim() === entry.name) {
      return;
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveName(candidate);
    }, 600);
  }

  function saveImmediately() {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!name.trim()) {
      setName(entry.name);
      return;
    }

    void saveName(name);
  }

  return (
    <div className="management-row">
      <input
        aria-label={`${entry.name}名稱`}
        maxLength={20}
        value={name}
        onBlur={saveImmediately}
        onChange={(event) => scheduleSave(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            saveImmediately();
          }
        }}
      />
      <span className={`status-pill ${entry.isActive ? '' : 'inactive'}`}>
        {entry.isActive ? '啟用中' : '已停用'}
      </span>
      <button
        className="text-button"
        type="button"
        onClick={() => void onUpdate(entry.name, !entry.isActive)}
      >
        {entry.isActive ? '停用' : '啟用'}
      </button>
      <IconButton
        icon="delete"
        label={`刪除 ${entry.name}`}
        type="button"
        onClick={onDelete}
      />
    </div>
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
  const code = errorCodeOf(error);
  if (code === ERROR_CODES.amountMustBePositive) {
    return '金額必須大於 0。';
  }

  if (code === ERROR_CODES.amountOutOfRange) {
    return `單筆金額上限為 ${formatTwd(
      MAX_FINANCIAL_ITEM_AMOUNT_TWD,
    )}。`;
  }

  return '操作失敗，請確認輸入內容後再試。';
}

function financialTone(
  value: number,
): 'positive' | 'negative' | 'neutral' {
  if (value > 0) {
    return 'positive';
  }

  if (value < 0) {
    return 'negative';
  }

  return 'neutral';
}

function managementErrorMessage(
  error: unknown,
  subject: '類型' | '分類',
): string {
  const code = errorCodeOf(error);

  if (code === ERROR_CODES.duplicateName) {
    return '已有相同名稱，請使用其他名稱。';
  }

  if (code === ERROR_CODES.builtInImmutable) {
    return `系統預設${subject}不能修改或刪除。`;
  }

  if (code === ERROR_CODES.resourceInUse) {
    return subject === '類型'
      ? '這個類型已有資產或負債使用，不能停用或刪除。'
      : '這個分類已被交易使用，不能直接刪除。';
  }

  return getErrorMessage(error);
}
