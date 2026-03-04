import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';

interface VerifyStepProps {
  onContinue: () => void;
  onRetryWrite?: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  success?: boolean | null;
  mismatchedBlocks?: number[];
}

export function VerifyStep({ onContinue, onRetryWrite, onReset, isLoading, success, mismatchedBlocks }: VerifyStepProps) {
  // Verifying in progress
  if (isLoading) {
    return (
      <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            <span style={{ animation: 'spin 1.5s linear infinite' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              &#x21BB;
            </span>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
              Verifying Clone...
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Reading back cloned card data and comparing.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Verification complete - success
  if (success === true) {
    return (
      <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: '#FFFFFF',
          }}>
            &#x2713;
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
              Clone Successful
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              The card data has been verified successfully.
            </div>
          </div>
          <Button variant="primary" size="md" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </Card>
    );
  }

  // Verification complete - failure
  if (success === false) {
    return (
      <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
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
            &#x2717;
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
              Verification Failed
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              The cloned data did not match the source.
            </div>
          </div>

          {mismatchedBlocks && mismatchedBlocks.length > 0 && (
            <InlineNotice variant="error" style={{ textAlign: 'left', width: '100%' }}>
              Mismatched blocks: {mismatchedBlocks.join(', ')}
            </InlineNotice>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {onRetryWrite && (
              <Button variant="secondary" size="sm" onClick={onRetryWrite}>
                Retry Write
              </Button>
            )}
            {onReset && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Waiting state (null success)
  return (
    <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
      <div style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        padding: 'var(--space-4) 0',
      }}>
        Waiting for verification result...
      </div>
    </Card>
  );
}
