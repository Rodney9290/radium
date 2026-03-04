import { useState, useCallback } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { detectChip, wipeChip } from '../../lib/api';
import type { DetectChipResult } from '../../lib/api';

type Phase = 'idle' | 'detecting' | 'detected' | 'erasing' | 'complete' | 'error';

interface EraseViewProps {
  port?: string;
}

export function EraseView({ port }: EraseViewProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [chip, setChip] = useState<DetectChipResult | null>(null);
  const [message, setMessage] = useState('');

  const handleDetect = useCallback(async () => {
    if (!port || phase === 'detecting' || phase === 'erasing') return;
    setPhase('detecting');
    setChip(null);
    setMessage('');
    try {
      const result = await detectChip(port);
      setChip(result);
      setPhase('detected');
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err !== null
        ? String(Object.values(err as Record<string, unknown>)[0])
        : String(err);
      setMessage(msg);
      setPhase('error');
    }
  }, [port, phase]);

  const handleErase = useCallback(async () => {
    if (!port || !chip || phase !== 'detected') return;
    setPhase('erasing');
    setMessage('');
    try {
      const result = await wipeChip(port, chip.chipType);
      if (result.success) {
        setMessage(result.message);
        setPhase('complete');
      } else {
        setMessage(result.message);
        setPhase('error');
      }
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err !== null
        ? String(Object.values(err as Record<string, unknown>)[0])
        : String(err);
      setMessage(msg);
      setPhase('error');
    }
  }, [port, chip, phase]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setChip(null);
    setMessage('');
  }, []);

  const noPort = !port;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          Erase Card
        </h2>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
          margin: 'var(--space-1) 0 0 0',
        }}>
          Detect a card's chip type and erase all data.
        </p>
      </div>

      {/* No device connected */}
      {noPort && (
        <InlineNotice variant="warning">
          No device connected. Go to the Scan tab and connect a Proxmark3 first.
        </InlineNotice>
      )}

      {/* Idle -- ready to detect */}
      {!noPort && phase === 'idle' && (
        <Card title="Step 1: Detect Chip">
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            margin: '0 0 var(--space-3) 0',
            lineHeight: '1.5',
          }}>
            Place a card on the reader and press Detect to identify the chip type.
          </p>
          <InlineNotice variant="warning" style={{ marginBottom: 'var(--space-4)' }}>
            This will permanently erase all data on the card.
          </InlineNotice>
          <Button variant="primary" onClick={handleDetect}>
            Detect Chip
          </Button>
        </Card>
      )}

      {/* Detecting chip */}
      {phase === 'detecting' && (
        <Card>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }}
            >
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}>
              Detecting chip...
            </span>
          </div>
        </Card>
      )}

      {/* Chip detected -- show info + erase button */}
      {phase === 'detected' && chip && (
        <>
          <Card title="Chip Detected">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Chip type row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  Chip Type
                </span>
                <Badge variant="success" label={chip.chipType} />
              </div>

              {/* Password protected */}
              {chip.passwordProtected && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    Protection
                  </span>
                  <Badge variant="warning" label="Password Protected" />
                </div>
              )}

              {/* Details */}
              {chip.details && (
                <p style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  margin: 0,
                  lineHeight: '1.5',
                }}>
                  {chip.details}
                </p>
              )}
            </div>
          </Card>

          {/* Warning + actions */}
          <Card>
            <InlineNotice variant="error" style={{ marginBottom: 'var(--space-4)' }}>
              <strong>Warning:</strong> This will erase ALL data on the {chip.chipType} chip.
              {chip.passwordProtected && ' Password will be reset.'}
            </InlineNotice>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button variant="destructive" onClick={handleErase}>
                Erase Chip
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Erasing */}
      {phase === 'erasing' && (
        <Card>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 16 16"
                style={{ animation: 'spin 0.8s linear infinite', color: 'var(--warning)' }}
              >
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
              </svg>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}>
                Erasing {chip?.chipType ?? 'chip'}...
              </span>
            </div>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
              paddingLeft: 'calc(20px + var(--space-3))',
            }}>
              Do not remove the card from the reader.
            </p>
          </div>
        </Card>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <Card>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--success-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8.5L6.5 11L12 5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}>
                Erase Complete
              </span>
            </div>
            {message && (
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
                margin: 0,
              }}>
                {message}
              </p>
            )}
            <div>
              <Button variant="primary" onClick={handleReset}>
                Erase Another
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {phase === 'error' && (
        <Card>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--error-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5 5L11 11M11 5L5 11" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}>
                Erase Failed
              </span>
            </div>
            {message && (
              <InlineNotice variant="error">
                {message}
              </InlineNotice>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button variant="primary" onClick={handleDetect}>
                Retry
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
