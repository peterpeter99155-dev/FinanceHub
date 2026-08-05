import { useEffect, useState } from 'react';

import type {
  ImportBatchHistoryItem,
  ImportBatchSnapshot,
} from '../application/import-service';
import { importErrorMessage } from './messages';

export interface ImportHistoryState {
  readonly items: readonly ImportBatchHistoryItem[];
  readonly loading: boolean;
  readonly error?: string;
  readonly openingId?: string;
  readonly reload: () => void;
  readonly open: (id: string) => Promise<void>;
}

export function useImportHistory(
  refreshKey: string | undefined,
  onOpen: (snapshot: ImportBatchSnapshot) => Promise<void>,
): ImportHistoryState {
  const [items, setItems] = useState<readonly ImportBatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openingId, setOpeningId] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void window.financeHub.imports.listBatches().then(
      (next) => {
        if (!active) return;
        setItems(next);
        setLoading(false);
      },
      (caught) => {
        if (!active) return;
        setError(importErrorMessage(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [refreshKey, reloadKey]);

  async function open(id: string): Promise<void> {
    setOpeningId(id);
    setError(undefined);
    try {
      await onOpen(await window.financeHub.imports.getBatch(id));
    } catch (caught) {
      setError(importErrorMessage(caught));
    } finally {
      setOpeningId(undefined);
    }
  }

  return {
    items,
    loading,
    error,
    openingId,
    reload: () => setReloadKey((current) => current + 1),
    open,
  };
}
