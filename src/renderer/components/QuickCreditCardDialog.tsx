import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';

import type { FinancialItem } from '../../domain/financial-item';
import { financialItemErrorMessage } from '../messages';

interface Props {
  readonly onCreated: (name: string) => Promise<FinancialItem>;
}

export function QuickCreditCardDialog({ onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (isOpen) nameInputRef.current?.focus();
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setName('');
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('請輸入信用卡名稱。');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      await onCreated(name.trim());
      close();
    } catch (caught) {
      setError(financialItemErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        新增信用卡
      </button>
      {isOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            aria-labelledby="quick-credit-card-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onSubmit={(event) => void submit(event)}
          >
            <p className="label">帳單匯入</p>
            <h2 id="quick-credit-card-title">新增信用卡</h2>
            <p>先建立名稱即可開始匯入，應繳餘額會從 TWD 0 起算。</p>
            <label>
              信用卡名稱
              <input
                ref={nameInputRef}
                maxLength={100}
                placeholder="例如：日常消費卡"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={isSaving}
                type="button"
                onClick={close}
              >
                取消
              </button>
              <button disabled={isSaving} type="submit">
                {isSaving ? '建立中…' : '建立並選取'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
