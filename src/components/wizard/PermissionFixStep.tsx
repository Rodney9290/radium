import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { InlineNotice } from '../shared/InlineNotice';
import type { PermissionCheck } from '../../lib/api';

interface PermissionFixStepProps {
  check: PermissionCheck;
  onRetry: () => void;
  onDismiss: () => void;
}

export function PermissionFixStep({ check, onRetry, onDismiss }: PermissionFixStepProps) {
  return (
    <Card title="Device Permissions" style={{ maxWidth: '520px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <InlineNotice variant="warning">
          Your system needs a few changes before it can communicate with the Proxmark3 device.
        </InlineNotice>

        {/* Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <CheckItem ok={check.userInDialout} label="User in dialout group" />
          <CheckItem ok={check.userInPlugdev} label="User in plugdev group" />
          <CheckItem ok={check.udevRuleInstalled} label="udev rules installed" />
        </div>

        {/* Fix commands */}
        {check.fixCommands.length > 0 && (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
              Run these commands in a terminal:
            </div>
            <div
              style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                lineHeight: '1.8',
                color: 'var(--text-primary)',
                overflowX: 'auto',
              }}
            >
              {check.fixCommands.map((cmd, i) => (
                <div key={i} style={{ color: cmd.startsWith('#') ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                  {cmd}
                </div>
              ))}
            </div>
          </div>
        )}

        <InlineNotice variant="info">
          You must log out and back in for group membership changes to take effect.
        </InlineNotice>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="primary" onClick={onRetry}>
            I've run the commands, retry
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: 'var(--radius-full)',
          background: ok ? 'var(--success-bg)' : 'var(--error-bg)',
          color: ok ? 'var(--success)' : 'var(--error)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {ok ? '\u2713' : '\u2717'}
      </div>
      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{label}</span>
    </div>
  );
}
