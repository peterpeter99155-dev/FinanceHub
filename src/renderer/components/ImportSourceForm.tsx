import { PasswordInput } from './PasswordInput';
import type { FinancialItem } from '../../domain/financial-item';
import type { ImportFileSelection } from '../../shared/imports';
import { QuickCreditCardDialog } from './QuickCreditCardDialog';
import { IMPORT_LABELS } from '../labels';

interface Props {
  readonly cards: readonly FinancialItem[];
  readonly selection: ImportFileSelection | null;
  readonly password: string;
  readonly cardId: string;
  readonly busy: boolean;
  readonly onCardId: (value: string) => void;
  readonly onPassword: (value: string) => void;
  readonly onSelect: () => void;
  readonly onParse: () => void;
  readonly onCreateCard: (name: string) => Promise<FinancialItem>;
}

export function ImportSourceForm(props: Props) {
  const selected = props.selection?.status === 'selected' ? props.selection : null;
  return (
    <section className="panel import-source-panel">
      <div className="section-heading"><div><p className="label">{IMPORT_LABELS.sourceEyebrow}</p><h2>{IMPORT_LABELS.sourceTitle}</h2><small>{IMPORT_LABELS.supportedSource}</small></div></div>
      {props.cards.length === 0 ? (
        <div className="empty-state"><p>{IMPORT_LABELS.noCreditCard}</p><QuickCreditCardDialog onCreated={props.onCreateCard} /></div>
      ) : (
        <div className="import-source-fields">
          <label>信用卡<select data-testid="import-card" value={props.cardId} onChange={(event) => props.onCardId(event.target.value)}>
            <option value="">{IMPORT_LABELS.chooseCreditCard}</option>
            {props.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select></label>
          <PasswordInput autoComplete="off" dataTestId="pdf-password" label={IMPORT_LABELS.pdfPassword} maxLength={128} placeholder={IMPORT_LABELS.pdfPasswordPlaceholder} restrictToNewPasswordCharacters={false} value={props.password} onChange={props.onPassword} onCompositionEnd={() => undefined} onCompositionStart={() => undefined} />
          <div className="import-source-actions">
            <button type="button" className="secondary-button" disabled={props.busy} onClick={props.onSelect}>{IMPORT_LABELS.selectPdf}</button>
            <span>{selected?.displayName ?? IMPORT_LABELS.noFileSelected}</span>
            <button className="primary-button import-parse-button" data-testid="parse-statement" type="button" disabled={props.busy || !selected || !props.cardId || !props.password} onClick={props.onParse}>{props.busy ? IMPORT_LABELS.parsing : IMPORT_LABELS.parse}</button>
          </div>
          <div><QuickCreditCardDialog onCreated={props.onCreateCard} /></div>
          <small>{IMPORT_LABELS.privacyNotice}</small>
        </div>
      )}
    </section>
  );
}
