import { type ReactNode, type CSSProperties } from 'react';

type NoticeVariant = 'info' | 'success' | 'warning' | 'error';

interface InlineNoticeProps {
  variant: NoticeVariant;
  children: ReactNode;
  style?: CSSProperties;
}

const variantConfig: Record<NoticeVariant, { bg: string; border: string; color: string }> = {
  info: { bg: 'var(--info-bg)', border: 'var(--info)', color: 'var(--text-primary)' },
  success: { bg: 'var(--success-bg)', border: 'var(--success)', color: 'var(--text-primary)' },
  warning: { bg: 'var(--warning-bg)', border: 'var(--warning)', color: 'var(--text-primary)' },
  error: { bg: 'var(--error-bg)', border: 'var(--error)', color: 'var(--text-primary)' },
};

export function InlineNotice({ variant, children, style }: InlineNoticeProps) {
  const cfg = variantConfig[variant];

  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-3) var(--space-4)',
        background: cfg.bg,
        borderLeft: `3px solid ${cfg.border}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        lineHeight: '1.5',
        color: cfg.color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
