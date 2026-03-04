import { useSettings } from '../../hooks/useSettings';
import { useMusic } from '../../hooks/useMusic';
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

export function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const music = useMusic();

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
