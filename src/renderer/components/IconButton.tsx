import type { ButtonHTMLAttributes } from 'react';

type IconName = 'edit' | 'delete' | 'close';

export function IconButton({
  icon,
  label,
  className = '',
  ...buttonProps
}: {
  icon: IconName;
  label: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={`icon-button ${icon} ${className}`.trim()}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}

function Icon({ name }: { name: IconName }) {
  if (name === 'edit') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Zm2-3.4 8.8-8.8 1.4 1.4L7.4 18H6v-1.4ZM17.2 2.6a2 2 0 0 1 2.8 0L21.4 4a2 2 0 0 1 0 2.8L20.2 8 16 3.8l1.2-1.2Z" />
      </svg>
    );
  }

  if (name === 'delete') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm1 6h2v8H9V9Zm4 0h2v8h-2V9ZM6 8h12l-1 13H7L6 8Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z" />
    </svg>
  );
}
