import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import type {
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
} from '../../domain/financial-item';
import { MAX_FINANCIAL_ITEM_AMOUNT_TWD } from '../../domain/financial-item';
import type {
  FinancialItemDraft,
} from '../../shared/financial-items';
import { FINANCIAL_ITEM_TYPE_LABELS } from '../../shared/financial-item-labels';
import type { FinancialItemFormDraft } from '../components/FinancialItemForm';
import type { ManagementSection } from '../components/ManagementDialog';
import { FINANCIAL_ITEM_TYPE_OPTIONS } from '../labels';
import { financialItemErrorMessage } from '../messages';
import { useFinancialItemState } from './useFinancialItemState';
import { useManagementState } from './useManagementState';

const EMPTY_DRAFT: FinancialItemFormDraft = {
  name: '',
  direction: 'asset',
  type: 'bank_deposit',
  amount: '',
  status: 'confirmed',
  includeInNetWorth: true,
};

export function useAppController() {
  const {
    actionError, draft, editingId, isDeleting, isSaving,
    pendingDeleteItem, setActionError, setDraft, setEditingId,
    setIsDeleting, setIsSaving, setPendingDeleteItem, setViewState,
    viewState,
  } = useFinancialItemState(EMPTY_DRAFT);
  const {
    activeView, categories, customTypes, isManagementOpen,
    managementError, managementSection, notification, setActiveView,
    setCategories, setCustomTypes, setIsManagementOpen,
    setManagementError, setManagementSection, setNotification,
    setTypeManagementVersion, typeManagementVersion,
  } = useManagementState();
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
        message: financialItemErrorMessage(error),
      });
    }
  }, [setCustomTypes, setViewState]);

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

  const activeItems = useMemo(
    () =>
      viewState.status === 'ready'
        ? viewState.snapshot.items.filter((item) => item.isActive)
        : [],
    [viewState],
  );
  const assetItems = useMemo(
    () => activeItems.filter((item) => item.direction === 'asset'),
    [activeItems],
  );
  const liabilityItems = useMemo(
    () => activeItems.filter((item) => item.direction === 'liability'),
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
        status:
          draft.status === 'pending_confirmation'
            ? 'pending_confirmation'
            : 'confirmed',
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
      setActionError(financialItemErrorMessage(error));
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
      status:
        item.status === 'pending_confirmation'
          ? 'pending_confirmation'
          : 'confirmed',
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
      const snapshot = await window.financeHub.financialItems.delete(
        pendingDeleteItem.id,
      );
      setViewState({ status: 'ready', snapshot });
      if (editingId === pendingDeleteItem.id) {
        resetForm();
      }
      setPendingDeleteItem(null);
      focusNameInput();
    } catch (error) {
      setActionError(financialItemErrorMessage(error));
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
      type: FINANCIAL_ITEM_TYPE_OPTIONS[direction][0].value,
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
    setDraft((current) => ({ ...current, amount: digits }));
  }

  function resetForm(
    direction: FinancialItemDirection = draft.direction,
  ) {
    setEditingId(null);
    setDraft({
      ...EMPTY_DRAFT,
      direction,
      type: FINANCIAL_ITEM_TYPE_OPTIONS[direction][0].value,
    });
    setActionError(null);
  }

  function focusNameInput() {
    window.focus();
    nameInputRef.current?.focus();
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

  async function openManagement(section: ManagementSection) {
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
      setActionError(financialItemErrorMessage(error));
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
    return item.customTypeId
      ? customTypes.find((type) => type.id === item.customTypeId)?.name ??
          FINANCIAL_ITEM_TYPE_LABELS[item.type]
      : FINANCIAL_ITEM_TYPE_LABELS[item.type];
  }

  function prepareNewAsset() {
    setActiveView('assets');
    setEditingId(null);
    setDraft({
      ...EMPTY_DRAFT,
      direction: 'asset',
      type: 'bank_deposit',
    });
    focusNameInput();
  }

  return {
    actionError, activeView, assetItems, categories, changeAmount,
    changeDirection, changeItemType, confirmDeleteItem, customTypes,
    draft, editingId, focusNameInput, formPanelRef, handleSubmit,
    isDeleting, isManagementOpen, isSaving, itemTypeLabel,
    liabilityItems, loadItems, managementError, managementSection,
    nameInputRef, notification, openManagement, pendingDeleteItem,
    prepareNewAsset, resetForm, setActiveView, setCategories,
    setCustomTypes, setDraft, setEditingId, setIsManagementOpen,
    setManagementError, setManagementSection, setPendingDeleteItem,
    setTypeManagementVersion, showNotification, startEditing,
    typeManagementVersion, viewState,
  };
}

function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
