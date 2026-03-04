import { useState, useEffect, useRef } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { ProgressBar } from '../shared/ProgressBar';
import { InlineNotice } from '../shared/InlineNotice';
import type { CardType } from '../../machines/types';

interface HfProcessStepProps {
  cardType: CardType | null;
  phase: string | null;
  keysFound: number;
  keysTotal: number;
  elapsed: number;
  onCancel: () => void;
}

/** Format seconds as MM:SS */
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Map Rust ProcessPhase to display label */
function phaseLabel(phase: string | null): string {
  switch (phase) {
    case 'KeyCheck': return 'Dictionary Attack';
    case 'Darkside': return 'Darkside Attack';
    case 'Nested': return 'Nested Attack';
    case 'Hardnested': return 'Hardnested Attack';
    case 'StaticNested': return 'Static Nested Attack';
    case 'Dumping': return 'Dumping Memory';
    default: return 'Initializing...';
  }
}

/** Card type display name */
function cardLabel(ct: CardType | null): string {
  switch (ct) {
    case 'MifareClassic1K': return 'MIFARE Classic 1K';
    case 'MifareClassic4K': return 'MIFARE Classic 4K';
    case 'MifareUltralight': return 'MIFARE Ultralight';
    case 'NTAG': return 'NTAG';
    case 'IClass': return 'iCLASS';
    default: return ct ?? 'Unknown';
  }
}

/** Check if this is a Classic card (long autopwn) vs simple dump */
function isClassic(ct: CardType | null): boolean {
  return ct === 'MifareClassic1K' || ct === 'MifareClassic4K';
}

export function HfProcessStep({
  cardType,
  phase,
  keysFound,
  keysTotal,
  onCancel,
}: HfProcessStepProps) {
  const [localElapsed, setLocalElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Client-side elapsed timer -- ticks every second independently of Rust events
  useEffect(() => {
    intervalRef.current = setInterval(() => setLocalElapsed(s => s + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const classic = isClassic(cardType);
  const progress = classic && keysTotal > 0
    ? Math.round((keysFound / keysTotal) * 100)
    : 0;

  return (
    <Card title="HF Processing" style={{ maxWidth: '440px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Key Recovery -- {cardLabel(cardType)}
        </div>

        {/* Info rows */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}>
          <InfoRow label="Phase" value={phaseLabel(phase)} />
          <InfoRow label="Elapsed" value={formatTime(localElapsed)} mono />
          {classic && (
            <InfoRow label="Keys" value={`${keysFound} / ${keysTotal}`} mono />
          )}
          {!classic && (
            <InfoRow label="Status" value="Dumping card memory..." />
          )}
        </div>

        {/* Progress bar for Classic cards */}
        {classic && (
          <ProgressBar value={progress} />
        )}

        <InlineNotice variant="warning">
          Do not remove the card from the reader.
        </InlineNotice>

        <Button variant="destructive" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: mono ? '12px' : '13px',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}
