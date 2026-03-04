import { useMemo } from 'react';
import { Card } from '../shared/Card';
import { ProgressBar } from '../shared/ProgressBar';
import { OnboardingTip } from '../onboarding/OnboardingTip';
import type { BlankType, CardType } from '../../machines/types';

interface WriteStepProps {
  isLoading?: boolean;
  progress?: number;
  currentBlock?: number | null;
  totalBlocks?: number | null;
  cardType?: CardType | null;
  blankType?: BlankType | null;
}

// Phase definitions matching the Rust write flow step counts.
// T5577: 6 steps (detect, password check, wipe, verify wipe, clone, finalize)
// EM4305: 5 steps (detect, wipe, verify wipe, clone, finalize)
const T5577_PHASES: { label: string; start: number; end: number }[] = [
  { label: 'Detect Blank', start: 0, end: 10 },
  { label: 'Password Check', start: 10, end: 20 },
  { label: 'Wipe', start: 20, end: 35 },
  { label: 'Verify Wipe', start: 35, end: 50 },
  { label: 'Clone Data', start: 50, end: 75 },
  { label: 'Finalize', start: 75, end: 100 },
];

const EM4305_PHASES: { label: string; start: number; end: number }[] = [
  { label: 'Detect Blank', start: 0, end: 10 },
  { label: 'Wipe', start: 10, end: 30 },
  { label: 'Verify Wipe', start: 30, end: 50 },
  { label: 'Clone Data', start: 50, end: 75 },
  { label: 'Finalize', start: 75, end: 100 },
];

interface PhaseStep {
  label: string;
  status: 'pending' | 'running' | 'done';
}

function getPhaseSteps(progress: number, blankType?: BlankType | null): PhaseStep[] {
  const phases = blankType === 'EM4305' ? EM4305_PHASES : T5577_PHASES;

  return phases.map(({ label, start, end }): PhaseStep => {
    if (progress >= end) {
      return { label, status: 'done' };
    } else if (progress >= start) {
      return { label, status: 'running' };
    } else {
      return { label, status: 'pending' };
    }
  });
}

export function WriteStep({
  isLoading,
  progress = 0,
  currentBlock,
  totalBlocks,
  cardType,
  blankType,
}: WriteStepProps) {
  const steps = useMemo(() => getPhaseSteps(progress, blankType), [progress, blankType]);

  const blockInfo = currentBlock !== null && currentBlock !== undefined && totalBlocks
    ? `Block ${currentBlock} of ${totalBlocks}`
    : null;

  return (
    <Card title="Writing" style={{ maxWidth: '420px', width: '100%' }}>
      <OnboardingTip tipId="write">
        Keep the blank card steady on the reader during writing. Don't remove it until the process completes.
      </OnboardingTip>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {cardType && (
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Cloning {cardType} to blank...
          </div>
        )}

        {/* Progress bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <ProgressBar value={progress} />
          {blockInfo && (
            <div style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              textAlign: 'center',
            }}>
              {blockInfo}
            </div>
          )}
        </div>

        {/* Phase steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: '13px',
              }}
            >
              <span style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
                flexShrink: 0,
                background: step.status === 'done'
                  ? 'var(--success)'
                  : step.status === 'running'
                    ? 'var(--accent)'
                    : 'var(--bg-tertiary)',
                color: step.status === 'pending'
                  ? 'var(--text-tertiary)'
                  : '#FFFFFF',
              }}>
                {step.status === 'done' ? '\u2713' : step.status === 'running' ? '\u2022' : (i + 1)}
              </span>
              <span style={{
                color: step.status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                fontWeight: step.status === 'running' ? 500 : 400,
              }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {isLoading && progress >= 100 && (
          <div style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--success)',
            textAlign: 'center',
            paddingTop: 'var(--space-2)',
          }}>
            Write complete -- verifying...
          </div>
        )}
      </div>
    </Card>
  );
}
