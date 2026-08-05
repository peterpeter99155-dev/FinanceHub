import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';

import type { FinancialItem } from '../../domain/financial-item';
import { financialItemErrorMessage } from '../messages';
import { IMPORT_LABELS } from '../labels';
import { IMPORT_MESSAGES } from '../messages';

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
      setError(IMPORT_MESSAGES.creditCardNameRequired);
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
      <button className="secondary-button" type="button" onClick={() => setIsOpen(true)}>
        {IMPORT_LABELS.quickCard}
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
            <p className="label">{IMPORT_LABELS.pageTitle}</p>
            <h2 id="quick-credit-card-title">{IMPORT_LABELS.quickCard}</h2>
            <p>{IMPORT_LABELS.quickCardHelp}</p>
            <label>
              {IMPORT_LABELS.quickCardName}
              <input
                ref={nameInputRef}
                maxLength={100}
                placeholder={IMPORT_LABELS.quickCardNamePlaceholder}
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
                {IMPORT_LABELS.cancel}
              </button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? IMPORT_LABELS.creating : IMPORT_LABELS.createAndSelect}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
