import { useSettings } from '../../hooks/useSettings';
import { Card } from '../shared/Card';

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) 0',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '13px',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
          marginTop: '2px',
        }}>
          {description}
        </div>
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

export function SettingsView() {
  const { settings, updateSettings } = useSettings();

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

      {/* General section */}
      <Card title="General">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <ToggleRow
            label="Expert Mode"
            description="Allow raw PM3 command input in terminal"
            checked={settings.expertMode}
            onChange={() => updateSettings({ expertMode: !settings.expertMode })}
          />
        </div>
      </Card>

      {/* Audio section */}
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
            description="Play ambient music while using the app"
            checked={settings.backgroundMusic}
            onChange={() => updateSettings({ backgroundMusic: !settings.backgroundMusic })}
          />
        </div>
      </Card>
    </div>
  );
}
