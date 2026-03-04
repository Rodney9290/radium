import { useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';
import { Spinner } from '../shared/Spinner';
import { OnboardingTip } from '../onboarding/OnboardingTip';
import type { BlankType } from '../../machines/types';

interface BlankStepProps {
  onReady: () => void;
  onErase?: () => Promise<void>;
  isLoading?: boolean;
  expectedBlank?: BlankType | null;
  blankType?: BlankType | null;
  readyToWrite?: boolean;
  existingData?: string | null;
  onReset?: () => void;
  onBack?: () => void;
  frequency?: 'LF' | 'HF' | null;
}

export function BlankStep({ onReady, onErase, isLoading, expectedBlank, blankType, readyToWrite, existingData, onReset, onBack, frequency }: BlankStepProps) {
  const [erasing, setErasing] = useState(false);

  const blankLabel = expectedBlank || 'T5577';
  const hasData = !!existingData;

  const handleErase = async () => {
    if (!onErase) return;
    setErasing(true);
    try {
      await onErase();
    } finally {
      setErasing(false);
    }
  };

  // Waiting / scanning for blank card
  if (isLoading) {
    return (
      <Card title="Blank Card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <OnboardingTip tipId="blank">
          Now place a blank magic card on the reader. Use T5577 for LF cards, or Gen1a/CUID for HF cards.
        </OnboardingTip>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            ...(erasing ? { animation: 'subtlePulse 2s ease-in-out infinite' } : {}),
          }}>
            {erasing && <style>{`@keyframes subtlePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>}
            {erasing ? <Spinner size={28} /> : '💳'}
          </div>

          <div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-1)',
            }}>
              {erasing ? 'Erasing Card...' : `Waiting for ${blankLabel}...`}
            </div>
            <div style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              lineHeight: '1.5',
            }}>
              {erasing
                ? 'Please wait while the card is being erased.'
                : frequency === 'HF'
                  ? 'Place on the HF side (opposite from coil).'
                  : frequency === 'LF'
                    ? 'Place on the LF side (coil side).'
                    : `Place a ${blankLabel} blank card on the reader.`}
            </div>
          </div>

          {!erasing && onReset && (
            <Button variant="destructive" size="sm" onClick={onReset}>
              Cancel
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Blank detected
  if (blankType) {
    return (
      <Card title="Blank Card" style={{ maxWidth: '420px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {blankType} Detected
            </span>
            <span style={{
              fontSize: '12px',
              color: hasData ? 'var(--warning)' : 'var(--success)',
              fontWeight: 500,
            }}>
              {hasData ? 'Has Data' : 'Clean'}
            </span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}>
            <span>Type</span>
            <span style={{ color: 'var(--text-primary)' }}>{blankType} (writable)</span>
          </div>

          {hasData && (
            <InlineNotice variant="warning">
              This card already contains {existingData} data. Erase it first or overwrite directly.
            </InlineNotice>
          )}

          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-secondary)',
          }}>
            {onBack && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back
              </Button>
            )}
            {hasData && onErase && (
              <Button variant="destructive" size="sm" onClick={handleErase}>
                Erase First
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={onReady}
              disabled={readyToWrite === false}
            >
              {hasData ? 'Overwrite' : 'Begin Write'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // No blank detected yet (non-loading fallback)
  return (
    <Card title="Blank Card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
      <div style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        padding: 'var(--space-4) 0',
      }}>
        Waiting for {blankLabel} blank card...
      </div>
    </Card>
  );
}
