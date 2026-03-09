import { useEffect, useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';
import { useNotifications } from '../../hooks/useNotifications';
import type { BlankType } from '../../machines/types';

interface HfDumpReadyStepProps {
  dumpInfo: string | null;
  keysFound: number;
  keysTotal: number;
  onWriteToBlank: (expectedBlank: BlankType) => void;
  onBack: () => void;
  recommendedBlank: BlankType | null;
}

export function HfDumpReadyStep({
  dumpInfo,
  keysFound,
  keysTotal,
  onWriteToBlank,
  onBack,
  recommendedBlank,
}: HfDumpReadyStepProps) {
  const { notify } = useNotifications();
  const [revealStatus, setRevealStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [eraseStatus, setEraseStatus] = useState<'idle' | 'confirming' | 'loading' | 'done' | 'error'>('idle');
  const [eraseMsg, setEraseMsg] = useState('');

  useEffect(() => {
    notify('Dump Ready', `${keysFound}/${keysTotal} keys recovered — ready to write`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReveal = async () => {
    setRevealStatus('loading');
    try {
      const { revealDumpFile } = await import('../../lib/api');
      await revealDumpFile();
      setRevealStatus('idle');
    } catch {
      setRevealStatus('error');
      setTimeout(() => setRevealStatus('idle'), 3000);
    }
  };

  const handleErase = async () => {
    if (eraseStatus === 'confirming') {
      setEraseStatus('loading');
      try {
        const { hfEraseCard } = await import('../../lib/api');
        await hfEraseCard();
        setEraseStatus('done');
        setEraseMsg('Card erased to factory defaults.');
        setTimeout(() => setEraseStatus('idle'), 4000);
      } catch (e) {
        setEraseStatus('error');
        setEraseMsg(e instanceof Error ? e.message : 'Erase failed.');
        setTimeout(() => setEraseStatus('idle'), 4000);
      }
    } else {
      setEraseStatus('confirming');
      setTimeout(() => {
        setEraseStatus(s => s === 'confirming' ? 'idle' : s);
      }, 5000);
    }
  };

  return (
    <Card title="Dump Ready" style={{ maxWidth: '440px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Success header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            color: '#FFFFFF',
            flexShrink: 0,
          }}>
            &#x2713;
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Key Recovery Complete
          </div>
        </div>

        {/* Summary info */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}>
          {keysTotal > 0 && (
            <SummaryRow label="Keys" value={`${keysFound} / ${keysTotal}`} />
          )}
          {dumpInfo && (
            <SummaryRow label="Dump" value={dumpInfo} />
          )}
          <SummaryRow label="Status" value="Saved successfully" />
        </div>

        {/* Swap cards instruction */}
        <InlineNotice variant="warning">
          <div style={{ fontWeight: 500, marginBottom: 'var(--space-1)' }}>Swap Cards</div>
          <div>1. Remove the source card from the reader</div>
          <div>2. Place the blank magic card you want to write to</div>
        </InlineNotice>

        {/* Erase feedback */}
        {(eraseStatus === 'done' || eraseStatus === 'error') && eraseMsg && (
          <InlineNotice variant={eraseStatus === 'done' ? 'success' : 'error'}>
            {eraseMsg}
          </InlineNotice>
        )}
        {revealStatus === 'error' && (
          <InlineNotice variant="error">Could not open file manager.</InlineNotice>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          paddingTop: 'var(--space-1)',
        }}>
          <Button variant="secondary" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReveal}
            loading={revealStatus === 'loading'}
          >
            Show in Finder
          </Button>
          <Button
            variant={eraseStatus === 'confirming' ? 'destructive' : 'ghost'}
            size="sm"
            onClick={handleErase}
            loading={eraseStatus === 'loading'}
          >
            {eraseStatus === 'confirming' ? 'Confirm Erase' : 'Erase Card'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { if (recommendedBlank) onWriteToBlank(recommendedBlank); }}
          >
            Write to Blank
          </Button>
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
