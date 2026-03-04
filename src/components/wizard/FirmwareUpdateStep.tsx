import { useState, useEffect } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { ProgressBar } from '../shared/ProgressBar';
import { InlineNotice } from '../shared/InlineNotice';

interface FirmwareUpdateStepProps {
  step: 'CheckingFirmware' | 'FirmwareOutdated' | 'UpdatingFirmware' | 'RedetectingDevice';
  clientVersion?: string | null;
  deviceFirmwareVersion?: string | null;
  hardwareVariant?: string | null;
  firmwarePathExists?: boolean;
  firmwareProgress?: number;
  firmwareMessage?: string | null;
  onUpdate: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onSelectVariant?: (variant: 'rdv4' | 'rdv4-bt' | 'generic') => void;
}

const VARIANT_OPTIONS: { id: 'rdv4' | 'rdv4-bt' | 'generic'; label: string; description: string }[] = [
  { id: 'rdv4', label: 'Proxmark3 RDV4', description: 'Standard RDV4 hardware' },
  { id: 'rdv4-bt', label: 'RDV4 + BlueShark', description: 'RDV4 with Bluetooth module' },
  { id: 'generic', label: 'PM3 Easy / Clone', description: 'Generic or clone hardware' },
];

export function FirmwareUpdateStep({
  step,
  clientVersion,
  deviceFirmwareVersion,
  hardwareVariant,
  firmwarePathExists = true,
  firmwareProgress = 0,
  firmwareMessage,
  onUpdate,
  onSkip,
  onCancel,
  onSelectVariant,
}: FirmwareUpdateStepProps) {
  const [dots, setDots] = useState('');

  const isAnimated = step === 'CheckingFirmware' || step === 'UpdatingFirmware' || step === 'RedetectingDevice';

  useEffect(() => {
    if (!isAnimated) return;
    const timer = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(timer);
  }, [isAnimated]);

  // Checking firmware
  if (step === 'CheckingFirmware') {
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
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Checking Firmware{dots}
          </div>
        </div>
      </Card>
    );
  }

  // Re-detecting device after flash
  if (step === 'RedetectingDevice') {
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
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Re-detecting Device{dots}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
              Port may have changed after firmware update.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Flashing firmware
  if (step === 'UpdatingFirmware') {
    return (
      <Card title="Firmware Update" style={{ maxWidth: '420px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Flashing firmware{dots}
          </div>

          <ProgressBar value={firmwareProgress} />

          {firmwareMessage && (
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              {firmwareMessage}
            </div>
          )}

          <InlineNotice variant="error">
            Do not disconnect the device during this process.
          </InlineNotice>

          <Button variant="destructive" size="sm" onClick={onCancel}>
            Cancel Flash
          </Button>
        </div>
      </Card>
    );
  }

  // Firmware outdated -- variant picker when hardware is unknown
  if (hardwareVariant === 'unknown' || !hardwareVariant) {
    return (
      <Card title="Select Hardware" style={{ maxWidth: '420px', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <InlineNotice variant="warning">
            Firmware mismatch detected. Hardware variant could not be identified automatically.
          </InlineNotice>

          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Select your Proxmark3 model to flash the correct firmware:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {VARIANT_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => onSelectVariant?.(opt.id)}
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 400 }}>{opt.description}</div>
                </div>
              </Button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </Card>
    );
  }

  // Firmware outdated -- variant known, show update/skip
  return (
    <Card title="Firmware Mismatch" style={{ maxWidth: '440px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <InlineNotice variant="warning">
          Firmware version mismatch detected.
        </InlineNotice>

        {/* Version comparison */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}>
          <VersionRow label="Client" value={clientVersion ?? 'unknown'} variant="current" />
          <VersionRow label="Device" value={deviceFirmwareVersion ?? 'unknown'} variant="outdated" />
          <VersionRow label="Hardware" value={hardwareVariant} variant="current" />
        </div>

        {firmwarePathExists ? (
          <>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Updating firmware ensures all commands work correctly.
              This will flash fullimage.elf only (safe, non-bricking).
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary" size="md" onClick={onUpdate}>
                Update Firmware
              </Button>
              <Button variant="ghost" size="md" onClick={onSkip}>
                Skip
              </Button>
            </div>
          </>
        ) : (
          <>
            <InlineNotice variant="warning">
              No bundled firmware for this hardware variant ({hardwareVariant}).
              Flash manually via CLI: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>proxmark3 --flash --image fullimage.elf</code>
            </InlineNotice>

            <Button variant="primary" size="md" onClick={onSkip}>
              Continue
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function VersionRow({ label, value, variant }: { label: string; value: string; variant: 'current' | 'outdated' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: variant === 'outdated' ? 'var(--error)' : 'var(--text-primary)',
      }}>
        {value}
      </span>
    </div>
  );
}
