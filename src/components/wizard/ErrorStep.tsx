import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';
import type { RecoveryAction } from '../../machines/types';

interface ErrorStepProps {
  message?: string | null;
  recoverable?: boolean;
  recoveryAction?: RecoveryAction | null;
  errorSource?: 'scan' | 'write' | 'detect' | 'verify' | 'blank' | null;
  onRetry: () => void;
  onReset: () => void;
}

function getRetryLabel(action: RecoveryAction | null | undefined, source?: string | null): string {
  if (action === 'Retry' && (source === 'write' || source === 'blank')) {
    return 'Retry Write';
  }
  switch (action) {
    case 'Reconnect':
      return 'Reconnect';
    case 'Retry':
      return 'Retry';
    case 'GoBack':
      return 'Go Back';
    default:
      return 'Retry';
  }
}

const DETECT_HINTS = [
  'Try a different USB cable (some cables are charge-only)',
  'Check Device Manager for a COM port (Ports section)',
  'PM3 Easy may need CH340 driver \u2014 download from wch-ic.com',
  'Antivirus may block proxmark3.exe \u2014 add it to exceptions',
];

export function ErrorStep({ message, recoverable, recoveryAction, errorSource, onRetry, onReset }: ErrorStepProps) {
  const displayMessage = message || 'An unexpected error occurred.';
  const retryLabel = getRetryLabel(recoveryAction, errorSource);
  const showDetectHints = errorSource === 'detect' && !message?.includes('firmware');

  return (
    <Card style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
        {/* Error icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--error)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          color: '#FFFFFF',
          fontWeight: 700,
        }}>
          !
        </div>

        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
          }}>
            Something Went Wrong
          </div>
        </div>

        <InlineNotice variant="error" style={{ width: '100%', textAlign: 'left' }}>
          {displayMessage}
        </InlineNotice>

        {showDetectHints && (
          <div style={{
            width: '100%',
            textAlign: 'left',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-2)',
            }}>
              Troubleshooting
            </div>
            {DETECT_HINTS.map((hint, i) => (
              <div key={i} style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                paddingLeft: 'var(--space-2)',
              }}>
                {i + 1}. {hint}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {recoverable && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onReset}>
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
}
