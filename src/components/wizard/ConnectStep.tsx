import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useSfx } from '../../hooks/useSfx';

interface ConnectStepProps {
  onConnected: () => void;
  isLoading?: boolean;
}

export function ConnectStep({ onConnected, isLoading }: ConnectStepProps) {
  const sfx = useSfx();
  return (
    <Card style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
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
        }}>
          {isLoading ? (
            <span style={{ animation: 'spin 1.5s linear infinite' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              &#x21BB;
            </span>
          ) : '📶'}
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
      </div>
    </Card>
  );
}
