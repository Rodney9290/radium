import { useState, type CSSProperties } from 'react';

interface SegmentedControlProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
}

export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)',
        padding: '2px',
        gap: '2px',
        ...style,
      }}
    >
      {options.map((opt) => (
        <SegmentButton
          key={opt.value}
          label={opt.label}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}

function SegmentButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 16px',
        fontSize: '13px',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        background: active ? 'var(--bg-primary)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        ...(hovered && !active ? { background: 'rgba(0,0,0,0.04)' } : {}),
      }}
    >
      {label}
    </button>
  );
}
