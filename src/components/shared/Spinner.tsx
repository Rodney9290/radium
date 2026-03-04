interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 32, color = 'var(--color-accent)' }: SpinnerProps) {
  const strokeWidth = size > 24 ? 3 : 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ animation: 'spinnerRotate 1s linear infinite' }}
    >
      <style>{`
        @keyframes spinnerRotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${circumference * 0.7} ${circumference * 0.3}`}
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
