import { useEffect } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useSfx } from '../../hooks/useSfx';
import type { CardType, CardData } from '../../machines/types';

interface CompleteStepProps {
  onReset: () => void;
  onDisconnect?: () => void;
  cardType?: CardType | null;
  cardData?: CardData | null;
  timestamp?: string | null;
}

export function CompleteStep({ onReset, onDisconnect, cardType, cardData, timestamp }: CompleteStepProps) {
  const sfx = useSfx();

  // Play success sound on mount
  useEffect(() => {
    sfx.action();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayType = cardType || 'Unknown';
  const displayUid = cardData?.uid || 'N/A';
  const displayTime = (() => {
    const iso = timestamp || new Date().toISOString();
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 19);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  })();

  return (
    <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) 0' }}>
        {/* Success icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          color: '#FFFFFF',
        }}>
          &#x2713;
        </div>

        <div>
          <div style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
          }}>
            Clone Complete
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Your card has been successfully cloned and verified.
          </div>
        </div>

        {/* Summary */}
        <div style={{
          width: '100%',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          textAlign: 'left',
        }}>
          <SummaryRow label="Source" value={`${displayType} / ${displayUid}`} />
          <SummaryRow label="Target" value="Clone (verified)" />
          <SummaryRow label="Time" value={displayTime} />
          <SummaryRow label="Status" value="Verified" />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button variant="primary" size="md" onClick={onReset}>
            Clone Another
          </Button>
          {onDisconnect && (
            <Button variant="ghost" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{value}</span>
    </div>
  );
}
