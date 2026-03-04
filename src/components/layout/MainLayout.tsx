import { useState, useEffect } from 'react';
import { TopBar } from './TopBar';
import { WizardContainer } from '../wizard/WizardContainer';
import { EraseView } from '../erase/EraseView';
import { HistoryView } from '../history/HistoryView';
import { SavedView } from '../saved/SavedView';
import { SettingsView } from '../settings/SettingsView';
import { useWizard } from '../../hooks/useWizard';
import { DetailsDrawer } from '../shared/DetailsDrawer';
import { SegmentedControl } from '../shared/SegmentedControl';
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

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabId>('clone');
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const wizard = useWizard();
  useMusic(); // Background music (controlled by settings)

  const connected = wizard.currentStep !== 'Idle' && wizard.currentStep !== 'DetectingDevice';

  // Fetch device capabilities when connected
  useEffect(() => {
    if (connected) {
      getDeviceCapabilities().then(setCapabilities).catch(() => {});
    } else {
      setCapabilities(null);
    }
  }, [connected]);

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
            <HistoryView />
          </div>
        );
      case 'saved':
        return (
          <div style={{ padding: 'var(--space-6)' }}>
            <SavedView />
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
