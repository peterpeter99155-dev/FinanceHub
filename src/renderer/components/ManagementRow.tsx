import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type { FinancialCategory } from '../../domain/category';
import type { FinancialItemCustomType } from '../../domain/financial-item-custom-type';
import { IconButton } from './IconButton';

export function ManagementRow({
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
