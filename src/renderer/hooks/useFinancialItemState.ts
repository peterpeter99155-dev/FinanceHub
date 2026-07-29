import { useState } from 'react';

import type { FinancialItem } from '../../domain/financial-item';
import type { FinancialItemSnapshot } from '../../shared/financial-items';
import type { FinancialItemFormDraft } from '../components/FinancialItemForm';

export type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: FinancialItemSnapshot }
  | { status: 'error'; message: string };

export function useFinancialItemState(
  emptyDraft: FinancialItemFormDraft,
) {
  const [viewState, setViewState] = useState<ViewState>({
    status: 'loading',
  });
  const [draft, setDraft] =
    useState<FinancialItemFormDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<FinancialItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  return {
    actionError,
    draft,
    editingId,
    isDeleting,
    isSaving,
    pendingDeleteItem,
    setActionError,
    setDraft,
    setEditingId,
    setIsDeleting,
    setIsSaving,
    setPendingDeleteItem,
    setViewState,
    viewState,
  };
}
