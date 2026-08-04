import {
  forwardRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react';

import { filterNewPasswordInput } from '../../shared/security-password';

interface PasswordInputProps {
  readonly autoComplete: 'current-password' | 'new-password' | 'off';
  readonly dataTestId: string;
  readonly label: string;
  readonly maxLength: number;
  readonly placeholder: string;
  readonly restrictToNewPasswordCharacters: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCompositionEnd: (
    event: CompositionEvent<HTMLInputElement>,
  ) => void;
  readonly onCompositionStart: () => void;
}

export const PasswordInput = forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(function PasswordInput(
  {
    autoComplete,
    dataTestId,
    label,
    maxLength,
    placeholder,
    restrictToNewPasswordCharacters,
    value,
    onChange,
    onCompositionEnd,
    onCompositionStart,
  },
  ref,
) {
  const [visible, setVisible] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = restrictToNewPasswordCharacters
      ? filterNewPasswordInput(event.target.value)
      : event.target.value;
    onChange(nextValue);
  }

  return (
    <label>
      {label}
      <span className="security-password-field">
        <input
          ref={ref}
          autoComplete={autoComplete}
          data-testid={dataTestId}
          maxLength={maxLength}
          placeholder={placeholder}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={handleChange}
          onCompositionEnd={onCompositionEnd}
          onCompositionStart={onCompositionStart}
        />
        <button
          aria-label={visible ? '隱藏密碼' : '顯示密碼'}
          className="security-password-toggle"
          data-password-visibility={visible ? 'visible' : 'hidden'}
          type="button"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </span>
    </label>
  );
});

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="password-visible-icon"
      viewBox="0 0 24 24"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="password-hidden-icon"
      viewBox="0 0 24 24"
    >
      <path d="m3 3 18 18M10.6 6.1A11.7 11.7 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3 3.7M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
