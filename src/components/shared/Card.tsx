import { type ReactNode, type CSSProperties } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
}

const padMap = { sm: 'var(--space-3)', md: 'var(--space-4)', lg: 'var(--space-6)' };

export function Card({ title, children, padding = 'md', style }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-secondary)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            padding: `var(--space-3) ${padMap[padding]}`,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border-secondary)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: padMap[padding] }}>{children}</div>
    </div>
  );
}
