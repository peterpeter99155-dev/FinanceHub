import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { BootstrapStatus } from '../../shared/bootstrap';
import { SECURITY_LABELS } from '../labels';
import {
  SECURITY_MESSAGES,
  securityErrorMessage,
} from '../messages';
import { isValidNewPassword } from '../../shared/security-password';
import { PasswordInput } from './PasswordInput';

type AccessMode = 'loading' | 'setup' | 'unlock' | 'unlocked' | 'error';

interface SecurityGateProps {
  readonly children: ReactNode;
}

export function SecurityGate({ children }: SecurityGateProps) {
  const [mode, setMode] = useState<AccessMode>('loading');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus | null>(null);

  useEffect(() => {
    let active = true;
    void window.financeHub
      .getBootstrapStatus()
      .then((status) => {
        if (active) {
          setBootstrapStatus(status);
          setMode(modeFor(status));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFatalError(securityErrorMessage(error));
          setMode('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (mode === 'unlocked') {
    return children;
  }

  return (
    <main className="security-shell">
      <header className="security-brand" aria-label="FinanceHub">
        <span aria-hidden="true">FH</span>
        <strong>FinanceHub</strong>
      </header>

      {mode === 'loading' && (
        <section className="security-card" aria-live="polite">
          <p>正在確認本機加密資料…</p>
        </section>
      )}

      {mode === 'error' && (
        <section className="security-card security-fatal" role="alert">
          <p className="eyebrow">無法安全開啟</p>
          <h1>加密資料需要處理</h1>
          <p>{fatalError}</p>
        </section>
      )}

      {(mode === 'setup' || mode === 'unlock') && (
        <SecurityAccessForm
          mode={mode}
          bootstrapStatus={bootstrapStatus}
          onUnlocked={() => setMode('unlocked')}
        />
      )}
    </main>
  );
}

interface SecurityAccessFormProps {
  readonly bootstrapStatus: BootstrapStatus | null;
  readonly mode: 'setup' | 'unlock';
  readonly onUnlocked: () => void;
}

function SecurityAccessForm({
  bootstrapStatus,
  mode,
  onUnlocked,
}: SecurityAccessFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const isSetup = mode === 'setup';

  useLayoutEffect(() => {
    passwordRef.current?.focus();
  }, [mode, error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composingRef.current || submitting) {
      return;
    }
    if (
      (isSetup && !isValidNewPassword(password)) ||
      (!isSetup && (password.length < 8 || password.length > 1024))
    ) {
      setError(
        isSetup
          ? SECURITY_MESSAGES.newPasswordInvalid
          : '主密碼須為 8 至 1024 個文字。',
      );
      return;
    }
    if (isSetup && password !== confirmation) {
      setError('兩次輸入的主密碼不一致。');
      return;
    }
    if (isSetup && !acknowledged) {
      setError('請先確認你了解資料無法復原的情況。');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await window.financeHub.unlockDatabase(password);
      setPassword('');
      setConfirmation('');
      onUnlocked();
    } catch (caught) {
      setError(securityErrorMessage(caught));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  function onCompositionStart() {
    composingRef.current = true;
  }

  function onCompositionEnd() {
    composingRef.current = false;
  }

  return (
    <section className="security-card" aria-labelledby="security-title">
      <p className="eyebrow">
        {isSetup
          ? SECURITY_LABELS.setupEyebrow
          : SECURITY_LABELS.unlockEyebrow}
      </p>
      <h1 id="security-title">
        {isSetup
          ? SECURITY_LABELS.setupTitle
          : SECURITY_LABELS.unlockTitle}
      </h1>
      <p className="security-intro">
        {isSetup
          ? 'FinanceHub 會在這台電腦上建立加密資料庫。'
          : '輸入主密碼後，才能讀取這台電腦上的財務資料。'}
      </p>

      <form onSubmit={(event) => void submit(event)}>
        <PasswordInput
          ref={passwordRef}
          autoComplete={isSetup ? 'new-password' : 'current-password'}
          dataTestId="security-password"
          label={SECURITY_LABELS.password}
          maxLength={isSetup ? 64 : 1024}
          placeholder={
            isSetup
              ? SECURITY_MESSAGES.newPasswordPlaceholder
              : '請輸入主密碼'
          }
          restrictToNewPasswordCharacters={isSetup}
          value={password}
          onChange={setPassword}
          onCompositionEnd={onCompositionEnd}
          onCompositionStart={onCompositionStart}
        />

        {isSetup && (
          <>
            <PasswordInput
              autoComplete="new-password"
              dataTestId="security-password-confirmation"
              label={SECURITY_LABELS.confirmPassword}
              maxLength={64}
              placeholder="請再輸入一次相同密碼"
              restrictToNewPasswordCharacters
              value={confirmation}
              onChange={setConfirmation}
              onCompositionEnd={onCompositionEnd}
              onCompositionStart={onCompositionStart}
            />
            <div className="security-warning">
              <strong>如何備份資料？</strong>
              <p>{SECURITY_MESSAGES.backupInstructions}</p>
              <ul>
                <li>
                  <code>{bootstrapStatus?.databaseFileName}</code>
                </li>
                <li>
                  <code>{bootstrapStatus?.metadataFileName}</code>
                </li>
              </ul>
              <p className="security-storage-path">
                資料位置：
                <code>{bootstrapStatus?.databaseDirectory}</code>
              </p>
              <strong>為什麼無法復原？</strong>
              <p>{SECURITY_MESSAGES.irreversibleWarning}</p>
            </div>
            <label className="checkbox-label security-confirmation">
              <input
                checked={acknowledged}
                type="checkbox"
                onChange={(event) =>
                  setAcknowledged(event.target.checked)
                }
              />
              {SECURITY_LABELS.acknowledgeRecoveryRisk}
            </label>
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button"
          disabled={submitting}
          type="submit"
        >
          {submitting
            ? '正在安全開啟…'
            : isSetup
              ? SECURITY_LABELS.createAndContinue
              : SECURITY_LABELS.unlockAndContinue}
        </button>
      </form>
    </section>
  );
}

function modeFor(status: BootstrapStatus): AccessMode {
  if (status.databaseState === 'unlocked') {
    return 'unlocked';
  }
  return status.databaseState === 'setup_required' ? 'setup' : 'unlock';
}
