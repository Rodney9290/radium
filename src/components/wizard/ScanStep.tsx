import { useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { Spinner } from '../shared/Spinner';
import { OnboardingTip } from '../onboarding/OnboardingTip';
import type { CardData, CardType, Frequency } from '../../machines/types';

interface ScanStepProps {
  device: { model: string; port: string; firmware: string };
  onScanned: () => void;
  onBack?: () => void;
  onSave?: (name: string) => Promise<void>;

  isLoading?: boolean;
  cardData?: CardData | null;
  cardType?: CardType | null;
  frequency?: Frequency | null;
  cloneable?: boolean;
  /** When true, WRITE button skips swap card dialog (HF cards need source on reader for autopwn) */
  skipSwapConfirm?: boolean;
}

export function ScanStep({
  device,
  onScanned,
  onBack,
  onSave,

  isLoading,
  cardData,
  cardType,
  frequency,
  cloneable,
  skipSwapConfirm,
}: ScanStepProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);

  // Card has been identified -- show results
  if (cardData && cardType) {
    const freqLabel = frequency === 'LF' ? '125 kHz (LF)' : frequency === 'HF' ? '13.56 MHz (HF)' : 'Unknown';
    const decodedEntries = cardData.decoded
      ? Object.entries(cardData.decoded).filter(([key]) => key !== 'type' && key !== 'uid' && key !== 'prng')
      : [];

    // Attack plan for MIFARE Classic HF cards
    const isMifareClassic = cardType === 'MifareClassic1K' || cardType === 'MifareClassic4K';
    const attackPlan = frequency === 'HF' && isMifareClassic ? (() => {
      const prng = (cardData.decoded?.prng ?? '').toUpperCase();
      const mfr = (cardData.decoded?.manufacturer ?? '').toLowerCase();
      const isFudan = mfr.includes('fudan') || mfr.includes('fm11rf08');

      if (isFudan) {
        return { prngLabel: 'BACKDOOR', color: 'var(--success)', method: 'FM11RF08S hardware backdoor', time: '< 1 second', blank: 'Magic MIFARE Gen1a' };
      } else if (prng === 'HARDENED') {
        return { prngLabel: 'HARDENED', color: '#f59e0b', method: 'Hardnested (SIMD solver)', time: '30–60 minutes', blank: 'Magic MIFARE Gen1a or Gen2' };
      } else if (prng === 'STATIC') {
        return { prngLabel: 'STATIC', color: '#60a5fa', method: 'Staticnested', time: '~5 minutes', blank: 'Magic MIFARE Gen1a' };
      } else {
        return { prngLabel: prng || 'WEAK', color: 'var(--success)', method: 'Nested (standard)', time: '~30 seconds', blank: 'Magic MIFARE Gen1a' };
      }
    })() : null;

    const handleSave = async () => {
      if (!saveName.trim() || !onSave) return;
      setSaveStatus('saving');
      try {
        await onSave(saveName.trim());
        setSavedDisplayName(saveName.trim());
        setSaveStatus('saved');
        setShowSaveInput(false);
        setSaveName('');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    };

    return (
      <>
        <Card title="Scan Result" style={{ maxWidth: '480px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Frequency badge */}
            <div>
              <Badge
                variant={frequency === 'LF' ? 'neutral' : frequency === 'HF' ? 'success' : 'warning'}
                label={freqLabel}
              />
            </div>

            {/* Attack plan panel for MIFARE Classic */}
            {attackPlan && (
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                border: `1px solid ${attackPlan.color}28`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Attack Plan
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-sm)',
                    background: `${attackPlan.color}1a`,
                    color: attackPlan.color,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                  }}>
                    PRNG: {attackPlan.prngLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <AttackRow label="Method" value={attackPlan.method} />
                  <AttackRow label="Est. time" value={attackPlan.time} mono />
                  <AttackRow label="Buy blank" value={attackPlan.blank} />
                </div>
              </div>
            )}

            {/* Info rows */}
            <InfoRow label="Type" value={cardType} />
            <InfoRow label="UID" value={cardData.uid} mono />
            {decodedEntries.map(([key, value]) => (
              <InfoRow key={key} label={key} value={String(value)} />
            ))}

            {cloneable === false && (
              <InlineNotice variant="warning" style={{ marginTop: 'var(--space-2)' }}>
                This card type cannot be cloned.
              </InlineNotice>
            )}

            {/* Save status feedback */}
            {saveStatus === 'saved' && (
              <InlineNotice variant="success">
                Saved as &ldquo;{savedDisplayName}&rdquo;
              </InlineNotice>
            )}
            {saveStatus === 'error' && (
              <InlineNotice variant="error">
                Failed to save card.
              </InlineNotice>
            )}

            {/* Inline save input */}
            {showSaveInput && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) 0',
              }}>
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') { setShowSaveInput(false); setSaveName(''); }
                  }}
                  placeholder="Card name..."
                  style={{
                    flex: 1,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    padding: '6px 10px',
                    outline: 'none',
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  loading={saveStatus === 'saving'}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowSaveInput(false); setSaveName(''); }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Action buttons */}
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
              {onSave && !showSaveInput && saveStatus !== 'saved' && (
                <Button variant="secondary" size="sm" onClick={() => { setShowSaveInput(true); setSaveStatus('idle'); }}>
                  Save Card
                </Button>
              )}
              {cloneable !== false && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => skipSwapConfirm ? onScanned() : setShowWriteConfirm(true)}
                >
                  Write Clone
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Write confirmation overlay */}
        {showWriteConfirm && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}>
            <Card style={{ maxWidth: '380px', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>
                  Swap Cards
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <div>1. Remove the scanned card from the reader</div>
                  <div>2. Place the blank card you want to write to</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                  <Button variant="secondary" size="sm" onClick={() => setShowWriteConfirm(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => { setShowWriteConfirm(false); onScanned(); }}>
                    Ready
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </>
    );
  }

  // Scanning or waiting to scan
  return (
    <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
      <OnboardingTip tipId="scan">
        Place your original card flat on the Proxmark3 antenna. Reading is completely non-destructive — your card won't be modified.
      </OnboardingTip>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
        {/* Device info */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-3)',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
        }}>
          <span>{device.model}</span>
          <span style={{ color: 'var(--border-primary)' }}>|</span>
          <span>{device.port}</span>
          <span style={{ color: 'var(--border-primary)' }}>|</span>
          <span>{device.firmware}</span>
        </div>

        {/* Scan icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          ...(isLoading ? { animation: 'subtlePulse 2s ease-in-out infinite' } : {}),
        }}>
          {isLoading && <style>{`@keyframes subtlePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>}
          {isLoading ? <Spinner size={32} /> : '📡'}
        </div>

        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
          }}>
            {isLoading ? 'Scanning...' : 'Scan Card'}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
          }}>
            {isLoading
              ? 'Hold card on reader...'
              : 'Place your card on the reader and press Scan.'}
          </div>
        </div>

        {!isLoading && (
          <Button variant="primary" size="lg" onClick={onScanned}>
            Scan
          </Button>
        )}

        <div style={{
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          lineHeight: '1.5',
          maxWidth: '300px',
        }}>
          {isLoading
            ? 'Checking both LF and HF frequencies'
            : 'Your reader has two antenna spots: coil side = LF (125 kHz), opposite side = HF (13.56 MHz). Try both if not detected.'}
        </div>
      </div>
    </Card>
  );
}

/** Compact row for attack plan panel */
function AttackRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: '12px',
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}

/** Reusable label:value row */
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: '13px',
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}
