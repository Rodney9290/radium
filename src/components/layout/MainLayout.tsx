import { useState, useEffect, useCallback } from 'react';
import { TopBar } from './TopBar';
import { WizardContainer } from '../wizard/WizardContainer';
import { EraseView } from '../erase/EraseView';
import { HistoryView } from '../history/HistoryView';
import { SavedView } from '../saved/SavedView';
import { SettingsView } from '../settings/SettingsView';
import { useWizard } from '../../hooks/useWizard';
import { useSettings } from '../../hooks/useSettings';
import { DetailsDrawer } from '../shared/DetailsDrawer';
import { SegmentedControl } from '../shared/SegmentedControl';
import { WelcomeModal } from '../onboarding/WelcomeModal';
import { getDeviceCapabilities } from '../../lib/api';
import { useMusic } from '../../hooks/useMusic';
import type { DeviceCapabilities } from '../../machines/types';

export type TabId = 'clone' | 'erase' | 'saved' | 'history' | 'settings';

const TAB_OPTIONS: { label: string; value: string }[] = [
  { label: 'Clone', value: 'clone' },
  { label: 'Erase', value: 'erase' },
  { label: 'Saved', value: 'saved' },
  { label: 'History', value: 'history' },
  { label: 'Settings', value: 'settings' },
];

const TAB_KEYS: TabId[] = ['clone', 'erase', 'saved', 'history', 'settings'];

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabId>('clone');
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const wizard = useWizard();
  const { settings, updateSettings } = useSettings();
  useMusic(); // Background music (controlled by settings)

  const triggerRefresh = useCallback(() => setRefreshTrigger(k => k + 1), []);

  // Apply theme preference to document root
  useEffect(() => {
    if (settings.theme === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd+1-5: switch tabs
      if (mod && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (TAB_KEYS[idx]) setActiveTab(TAB_KEYS[idx]);
        return;
      }

      // Cmd+D: detect/connect device
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setActiveTab('clone');
        wizard.detect();
        return;
      }

      // Cmd+R: refresh current view
      if (mod && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        triggerRefresh();
        return;
      }

      // Esc: reset wizard
      if (e.key === 'Escape') {
        wizard.reset();
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [wizard, triggerRefresh]);

  const connected = wizard.currentStep !== 'Idle' && wizard.currentStep !== 'DetectingDevice';

  // Fetch device capabilities when connected
  useEffect(() => {
    if (connected) {
      getDeviceCapabilities().then(setCapabilities).catch(() => {});
    } else {
      setCapabilities(null);
    }
  }, [connected]);

  // Auto-reconnect: poll for device when idle and setting is enabled
  useEffect(() => {
    if (!settings.autoReconnect) return;
    if (wizard.currentStep !== 'Idle') return;

    const interval = setInterval(() => {
      wizard.detect();
    }, 3000);

    return () => clearInterval(interval);
  }, [settings.autoReconnect, wizard.currentStep, wizard]);

  const renderContent = () => {
    switch (activeTab) {
      case 'clone':
        return <WizardContainer />;
      case 'erase':
        return (
          <div style={{ padding: 'var(--space-6)', display: 'flex', justifyContent: 'center' }}>
            <EraseView port={wizard.context.port ?? undefined} />
          </div>
        );
      case 'history':
        return (
          <div style={{ padding: 'var(--space-6)' }}>
            <HistoryView refreshTrigger={refreshTrigger} />
          </div>
        );
      case 'saved':
        return (
          <div style={{ padding: 'var(--space-6)' }}>
            <SavedView refreshTrigger={refreshTrigger} onNavigateToClone={() => setActiveTab('clone')} />
          </div>
        );
      case 'settings':
        return (
          <div style={{ padding: 'var(--space-6)' }}>
            <SettingsView />
          </div>
        );
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '48px 44px 1fr auto',
        width: '100%',
        height: '100%',
      }}
    >
      {!settings.onboardingCompleted && (
        <WelcomeModal onComplete={() => updateSettings({ onboardingCompleted: true })} />
      )}
      {/* Header */}
      <TopBar connected={connected} capabilities={capabilities} onDisconnect={wizard.disconnect} />

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 var(--space-4)',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(v) => setActiveTab(v as TabId)}
        />
      </div>

      {/* Main content */}
      <div
        style={{
          overflow: 'auto',
          background: 'var(--bg-secondary)',
        }}
      >
        {renderContent()}
      </div>

      {/* Details drawer (collapsible log) */}
      <DetailsDrawer />
    </div>
  );
}
