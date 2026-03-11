import { useState } from 'react';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';
import { iclassCollectMacs, iclassLoclassRecover } from '../../lib/api';

type RecoveryStep = 'idle' | 'collecting' | 'collected' | 'recovering' | 'recovered' | 'error';

interface EliteRecoveryPanelProps {
  /** Called after key is successfully recovered */
  onKeyRecovered: (key: string) => void;
}

export function EliteRecoveryPanel({ onKeyRecovered }: EliteRecoveryPanelProps) {
  const [step, setStep] = useState<RecoveryStep>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [recoveredKey, setRecoveredKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCollectMacs = async () => {
    setStep('collecting');
    setErrorMessage('');
    try {
      const result = await iclassCollectMacs();
      setStatusMessage(result);
      setStep('collected');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const handleRecoverKey = async () => {
    setStep('recovering');
    setErrorMessage('');
    try {
      const result = await iclassLoclassRecover();
      // Extract key from result message (format: "Key recovered: XXXXXXXXXXXXXXXX. Ready to dump/clone.")
      const keyMatch = result.match(/([0-9A-Fa-f]{16})/);
      const key = keyMatch ? keyMatch[1] : '';
      setRecoveredKey(key);
      setStep('recovered');
      if (key) onKeyRecovered(key);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
      border: '1px solid #f59e0b28',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Key Recovery Required
        </span>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: 'var(--radius-sm)',
          background: '#f59e0b1a',
          color: '#f59e0b',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
        }}>
          iCLASS ELITE
        </span>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: 'var(--space-3)' }}>
        This card uses diversified keys. You need to collect authentication
        traces from the physical door reader, then crack the key.
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <StepRow
          number={1}
          label="Collect MACs at door reader"
          description="Hold PM3 up to the reader for ~30 seconds"
          active={step === 'idle' || step === 'collecting'}
          done={step === 'collected' || step === 'recovering' || step === 'recovered'}
        />
        <StepRow
          number={2}
          label="Crack the key (loclass)"
          description="Offline attack against collected traces"
          active={step === 'collected' || step === 'recovering'}
          done={step === 'recovered'}
        />
      </div>

      {/* Status messages */}
      {statusMessage && step === 'collected' && (
        <InlineNotice variant="success" style={{ marginBottom: 'var(--space-2)' }}>
          {statusMessage}
        </InlineNotice>
      )}
      {recoveredKey && step === 'recovered' && (
        <InlineNotice variant="success" style={{ marginBottom: 'var(--space-2)' }}>
          Key recovered: <span style={{ fontFamily: 'var(--font-mono)' }}>{recoveredKey}</span>
        </InlineNotice>
      )}
      {errorMessage && step === 'error' && (
        <InlineNotice variant="error" style={{ marginBottom: 'var(--space-2)' }}>
          {errorMessage}
        </InlineNotice>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {(step === 'idle' || step === 'error') && (
          <Button variant="primary" size="sm" onClick={handleCollectMacs}>
            Collect MACs
          </Button>
        )}
        {step === 'collecting' && (
          <Button variant="primary" size="sm" loading disabled>
            Collecting...
          </Button>
        )}
        {step === 'collected' && (
          <Button variant="primary" size="sm" onClick={handleRecoverKey}>
            Recover Key
          </Button>
        )}
        {step === 'recovering' && (
          <Button variant="primary" size="sm" loading disabled>
            Cracking...
          </Button>
        )}
        {step === 'recovered' && (
          <Button variant="primary" size="sm" disabled>
            Key Recovered
          </Button>
        )}
      </div>
    </div>
  );
}

function StepRow({ number, label, description, active, done }: {
  number: number;
  label: string;
  description: string;
  active: boolean;
  done: boolean;
}) {
  const color = done ? 'var(--success)' : active ? '#f59e0b' : 'var(--text-tertiary)';
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        fontWeight: 700,
        color,
        flexShrink: 0,
        marginTop: '1px',
      }}>
        {done ? '\u2713' : number}
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: done ? 'var(--success)' : 'var(--text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
          {description}
        </div>
      </div>
    </div>
  );
}
