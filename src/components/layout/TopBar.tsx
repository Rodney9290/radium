import { Badge } from '../shared/Badge';
import { Button } from '../shared/Button';
import type { DeviceCapabilities, ProxmarkPlatform } from '../../machines/types';

const PLATFORM_LABELS: Record<ProxmarkPlatform, string> = {
  Easy: 'PM3 Easy',
  RDV4: 'RDV4',
  RDV4BT: 'RDV4 + BT',
  ICopyX: 'iCopy-X',
  Generic256: 'PM3 256K',
};

interface TopBarProps {
  connected: boolean;
  capabilities?: DeviceCapabilities | null;
  onDisconnect?: () => void;
}

export function TopBar({ connected, capabilities, onDisconnect }: TopBarProps) {
  return (
    <div
      style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-4)',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-secondary)',
      }}
    >
      {/* Left: App title */}
      <div
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        Radium
      </div>

      {/* Center: Connection status + device platform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Badge
          variant={connected ? 'success' : 'neutral'}
          label={connected ? 'Connected' : 'Disconnected'}
        />
        {connected && capabilities && (
          <Badge
            variant="info"
            label={PLATFORM_LABELS[capabilities.platform] ?? capabilities.platform}
          />
        )}
      </div>

      {/* Right: Disconnect button */}
      <div style={{ minWidth: '100px', display: 'flex', justifyContent: 'flex-end' }}>
        {connected && onDisconnect && (
          <Button variant="ghost" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
