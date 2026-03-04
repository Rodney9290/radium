import { type CSSProperties } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info';

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  dot?: boolean;
  style?: CSSProperties;
}

const badgeConfig: Record<BadgeVariant, { bg: string; color: string; dot: string }> = {
  success: { bg: 'var(--success-bg)', color: 'var(--success)', dot: 'var(--success)' },
  warning: { bg: 'var(--warning-bg)', color: 'var(--warning)', dot: 'var(--warning)' },
  error: { bg: 'var(--error-bg)', color: 'var(--error)', dot: 'var(--error)' },
  neutral: { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)', dot: 'var(--text-quaternary)' },
  info: { bg: 'var(--info-bg)', color: 'var(--info)', dot: 'var(--info)' },
};

export function Badge({ variant, label, dot = true, style }: BadgeProps) {
  const cfg = badgeConfig[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: 'var(--radius-full)',
        background: cfg.bg,
        color: cfg.color,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: cfg.dot,
          }}
        />
      )}
      {label}
    </span>
  );
}
