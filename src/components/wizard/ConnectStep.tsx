import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Spinner } from '../shared/Spinner';
import { OnboardingTip } from '../onboarding/OnboardingTip';
import { useSfx } from '../../hooks/useSfx';
import { useSettings } from '../../hooks/useSettings';

interface ConnectStepProps {
  onConnected: () => void;
  isLoading?: boolean;
}

export function ConnectStep({ onConnected, isLoading }: ConnectStepProps) {
  const sfx = useSfx();
  const { settings } = useSettings();
  return (
    <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
      <OnboardingTip tipId="connect">
        Plug in your Proxmark3 via USB and click Connect.
      </OnboardingTip>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
        {/* Device icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          ...(isLoading ? { animation: 'subtlePulse 2s ease-in-out infinite' } : {}),
        }}>
          {isLoading && <style>{`@keyframes subtlePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }`}</style>}
          {isLoading ? <Spinner size={28} /> : '📶'}
        </div>

        <div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
          }}>
            {isLoading ? 'Detecting Device...' : 'Connect Your Proxmark3'}
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
          }}>
            {isLoading
              ? 'Searching for connected devices...'
              : 'Plug in your Proxmark3 device and click Connect to get started.'}
          </div>
        </div>

        {!isLoading && (
          <Button variant="primary" size="lg" onClick={() => { sfx.action(); onConnected(); }}>
            Connect
          </Button>
        )}

        {!isLoading && settings.autoReconnect && (
          <div style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-quaternary)' }}>
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" style={{ animation: 'spin 2s linear infinite' }} />
              <style>{`@keyframes spin { to { transform-origin: center; transform: rotate(360deg); } }`}</style>
            </svg>
            Searching for device...
          </div>
        )}
      </div>
    </Card>
  );
}
