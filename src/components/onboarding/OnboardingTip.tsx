import { useState, type ReactNode } from 'react';

interface OnboardingTipProps {
  tipId: string;
  children: ReactNode;
}

const TIP_PREFIX = 'radium-tip-';

function isDismissed(tipId: string): boolean {
  try {
    return localStorage.getItem(TIP_PREFIX + tipId) === '1';
  } catch {
    return false;
  }
}

function dismiss(tipId: string) {
  try {
    localStorage.setItem(TIP_PREFIX + tipId, '1');
  } catch {
    // Storage unavailable
  }
}

export function resetAllTips() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(TIP_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable
  }
}

export function OnboardingTip({ tipId, children }: OnboardingTipProps) {
  const [hidden, setHidden] = useState(() => isDismissed(tipId));

  if (hidden) return null;

  const handleDismiss = () => {
    dismiss(tipId);
    setHidden(true);
  };

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--info-bg)',
      borderLeft: '3px solid var(--info)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '13px',
      lineHeight: '1.5',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3)',
      marginBottom: 'var(--space-4)',
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss tip"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          fontSize: '16px',
          lineHeight: 1,
          padding: '2px',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
