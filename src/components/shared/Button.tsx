import { type ReactNode, type CSSProperties, useState } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

const variantStyles: Record<ButtonVariant, { base: CSSProperties; hover: CSSProperties }> = {
  primary: {
    base: {
      background: 'var(--accent)',
      color: '#FFFFFF',
      border: 'none',
    },
    hover: {
      background: 'var(--accent-hover)',
    },
  },
  secondary: {
    base: {
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-primary)',
    },
    hover: {
      background: 'var(--bg-tertiary)',
    },
  },
  ghost: {
    base: {
      background: 'transparent',
      color: 'var(--accent)',
      border: 'none',
    },
    hover: {
      background: 'var(--bg-tertiary)',
    },
  },
  destructive: {
    base: {
      background: 'var(--error)',
      color: '#FFFFFF',
      border: 'none',
    },
    hover: {
      background: '#E0332B',
    },
  },
};

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '13px', borderRadius: 'var(--radius-sm)' },
  md: { padding: '8px 20px', fontSize: '14px', borderRadius: 'var(--radius-md)' },
  lg: { padding: '12px 28px', fontSize: '16px', borderRadius: 'var(--radius-lg)' },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  style,
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled || loading;
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'all var(--transition-fast)',
        width: fullWidth ? '100%' : undefined,
        ...vs.base,
        ...ss,
        ...(hovered && !isDisabled ? vs.hover : {}),
        ...style,
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );
}
