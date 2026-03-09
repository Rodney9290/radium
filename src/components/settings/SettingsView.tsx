import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { useMusic } from '../../hooks/useMusic';
import { requestNotificationPermission } from '../../hooks/useNotifications';
import { hwTune, type AntennaResult } from '../../lib/api';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { SegmentedControl } from '../shared/SegmentedControl';

const labelStyle = {
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
} as const;

const descStyle = {
  fontSize: '13px',
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-sans)',
  marginTop: '2px',
} as const;

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-3) 0',
} as const;

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ flex: 1 }}>
        <div style={labelStyle}>{label}</div>
        <div style={descStyle}>{description}</div>
      </div>
      <button
        onClick={onChange}
        aria-checked={checked}
        role="switch"
        style={{
          position: 'relative',
          width: '44px',
          height: '26px',
          borderRadius: 'var(--radius-full)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
          transition: 'background var(--transition-fast)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: checked ? '21px' : '3px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: 'var(--shadow-sm)',
            transition: 'left var(--transition-fast)',
          }}
        />
      </button>
    </div>
  );
}

const MOD = navigator.platform?.startsWith('Mac') ? '\u2318' : 'Ctrl+';

const SHORTCUTS = [
  { keys: `${MOD}1\u20135`, action: 'Switch tabs' },
  { keys: `${MOD}D`, action: 'Connect device' },
  { keys: `${MOD}R`, action: 'Refresh current view' },
  { keys: 'Esc', action: 'Cancel / Reset' },
];

function SignalBar({ voltage, max, ok }: { voltage: number | null; max: number; ok: boolean }) {
  const pct = voltage !== null ? Math.min(100, (voltage / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
      <div style={{
        flex: 1,
        height: '8px',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: ok ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: ok ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
        minWidth: '60px',
        textAlign: 'right',
      }}>
        {voltage !== null ? `${(voltage / 1000).toFixed(1)} V` : '—'}
      </span>
    </div>
  );
}

export function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const music = useMusic();
  const [tuneResult, setTuneResult] = useState<AntennaResult | null>(null);
  const [tuning, setTuning] = useState(false);
  const [tuneError, setTuneError] = useState<string | null>(null);

  const runTune = async () => {
    setTuning(true);
    setTuneError(null);
    setTuneResult(null);
    try {
      const result = await hwTune();
      setTuneResult(result);
    } catch (err) {
      const raw = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null ? (Object.values(err)[0] as string) ?? String(err)
        : String(err);
      // Show friendly message for "not connected" errors
      setTuneError(
        raw.includes('Not connected') || raw.includes('connect')
          ? 'Device not connected. Connect a PM3 device first.'
          : 'Antenna test failed. Check device connection and try again.'
      );
    } finally {
      setTuning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          Settings
        </h2>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
          margin: 'var(--space-1) 0 0 0',
        }}>
          Configure application preferences.
        </p>
      </div>

      {/* Appearance */}
      <Card title="Appearance">
        <div style={rowStyle}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Theme</div>
            <div style={descStyle}>Choose your preferred appearance</div>
          </div>
          <SegmentedControl
            options={[
              { label: 'System', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]}
            value={settings.theme}
            onChange={(v) => updateSettings({ theme: v as 'system' | 'light' | 'dark' })}
          />
        </div>
      </Card>

      {/* General */}
      <Card title="General">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <ToggleRow
            label="Expert Mode"
            description="Allow raw PM3 command input in terminal"
            checked={settings.expertMode}
            onChange={() => updateSettings({ expertMode: !settings.expertMode })}
          />
          <ToggleRow
            label="Auto-Reconnect"
            description="Automatically detect device when plugged in"
            checked={settings.autoReconnect}
            onChange={() => updateSettings({ autoReconnect: !settings.autoReconnect })}
          />
          <ToggleRow
            label="Notifications"
            description="Show system notification when clone completes"
            checked={settings.notifications}
            onChange={async () => {
              if (!settings.notifications) {
                const granted = await requestNotificationPermission();
                if (granted) updateSettings({ notifications: true });
              } else {
                updateSettings({ notifications: false });
              }
            }}
          />
        </div>
      </Card>

      {/* Audio */}
      <Card title="Audio">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <ToggleRow
            label="Sound Effects"
            description="Play feedback sounds on key actions"
            checked={settings.soundEffects}
            onChange={() => updateSettings({ soundEffects: !settings.soundEffects })}
          />
          <ToggleRow
            label="Background Music"
            description="Shuffle electronic & cyberpunk tracks"
            checked={settings.backgroundMusic}
            onChange={() => updateSettings({ backgroundMusic: !settings.backgroundMusic })}
          />
          {settings.backgroundMusic && (
            <>
              {/* Volume slider */}
              <div style={rowStyle}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Volume</div>
                  <div style={descStyle}>Adjust background music volume</div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  minWidth: '160px',
                }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.musicVolume}
                    onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })}
                    style={{
                      flex: 1,
                      accentColor: 'var(--accent)',
                      height: '4px',
                    }}
                  />
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                    minWidth: '32px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {settings.musicVolume}%
                  </span>
                </div>
              </div>
              {/* Skip track */}
              <div style={{ padding: 'var(--space-2) 0' }}>
                <Button variant="secondary" size="sm" onClick={music.skip}>
                  Skip Track
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card title="Keyboard Shortcuts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SHORTCUTS.map(({ keys, action }) => (
            <div
              key={keys}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) 0',
              }}
            >
              <span style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
              }}>
                {action}
              </span>
              <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                padding: '2px 8px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-secondary)',
              }}>
                {keys}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Diagnostics */}
      <Card title="Diagnostics">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', margin: 0 }}>
            Measure antenna signal strength to verify your PM3 hardware is working correctly.
          </p>

          {tuneResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', minWidth: '24px' }}>LF</span>
                <SignalBar voltage={tuneResult.lfVoltageMv} max={60000} ok={tuneResult.lfOk} />
                <Badge variant={tuneResult.lfOk ? 'success' : 'warning'} label={tuneResult.lfOk ? 'OK' : 'Weak'} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', minWidth: '24px' }}>HF</span>
                <SignalBar voltage={tuneResult.hfVoltageMv} max={35000} ok={tuneResult.hfOk} />
                <Badge variant={tuneResult.hfOk ? 'success' : 'warning'} label={tuneResult.hfOk ? 'OK' : 'Weak'} />
              </div>
            </div>
          )}

          {tuneError && (
            <p style={{ fontSize: '13px', color: 'var(--color-error, #ef4444)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              {tuneError}
            </p>
          )}

          <div>
            <Button variant="secondary" size="sm" onClick={runTune} disabled={tuning}>
              {tuning ? 'Measuring…' : 'Test Antenna'}
            </Button>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card title="About">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) 0',
          }}>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}>
              Radium
            </span>
            <Badge variant="neutral" label="v1.2.0" dot={false} />
          </div>

          <p style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            lineHeight: '1.5',
          }}>
            Desktop GUI for Proxmark3 RFID card cloning.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) 0',
            borderTop: '1px solid var(--border-secondary)',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              License
            </span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
              GPL-3.0
            </span>
          </div>

          <div style={{
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            padding: 'var(--space-2) 0',
            borderTop: '1px solid var(--border-secondary)',
          }}>
            Originally created by nik shuv
          </div>

          <div style={{ paddingTop: 'var(--space-1)' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
                  openUrl('https://github.com/Rodney9290/radium');
                }).catch(() => {
                  window.open('https://github.com/Rodney9290/radium', '_blank');
                });
              }}
            >
              View on GitHub
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
