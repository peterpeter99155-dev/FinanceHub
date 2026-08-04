import { PasswordInput } from './PasswordInput';
import type { FinancialItem } from '../../domain/financial-item';
import type { ImportFileSelection } from '../../shared/imports';

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
  readonly onCreateCard: () => void;
}

export function ImportSourceForm(props: Props) {
  const selected = props.selection?.status === 'selected' ? props.selection : null;
  return (
    <section className="panel import-source-panel">
      <div className="section-heading"><div><p className="label">本機帳單</p><h2>匯入永豐信用卡月結帳單</h2></div></div>
      {props.cards.length === 0 ? (
        <div className="empty-state"><p>請先新增要對應的信用卡。</p><button type="button" onClick={props.onCreateCard}>新增信用卡</button></div>
      ) : (
        <div className="import-source-fields">
          <label>信用卡<select data-testid="import-card" value={props.cardId} onChange={(event) => props.onCardId(event.target.value)}>
            <option value="">請選擇信用卡</option>
            {props.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select></label>
          <PasswordInput autoComplete="off" dataTestId="pdf-password" label="PDF 密碼" maxLength={128} placeholder="只用於這次開啟帳單" restrictToNewPasswordCharacters={false} value={props.password} onChange={props.onPassword} onCompositionEnd={() => undefined} onCompositionStart={() => undefined} />
          <div className="import-source-actions">
            <button type="button" className="secondary-button" disabled={props.busy} onClick={props.onSelect}>選擇 PDF</button>
            <span>{selected?.displayName ?? '尚未選擇檔案'}</span>
            <button data-testid="parse-statement" type="button" disabled={props.busy || !selected || !props.cardId || !props.password} onClick={props.onParse}>開始解析</button>
          </div>
          <small>PDF 密碼不會保存、記錄或顯示在解析結果中；原始 PDF 也不會複製保存。</small>
        </div>
      )}
    </section>
  );
}
