import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface RadiumSettings {
  expertMode: boolean;
  soundEffects: boolean;
  backgroundMusic: boolean;
  onboardingCompleted: boolean;
  theme: 'system' | 'light' | 'dark';
  musicVolume: number;
  autoReconnect: boolean;
  notifications: boolean;
}

const DEFAULT_SETTINGS: RadiumSettings = {
  expertMode: false,
  soundEffects: false,
  backgroundMusic: false,
  onboardingCompleted: false,
  theme: 'system',
  musicVolume: 30,
  autoReconnect: true,
  notifications: false,
};

const STORAGE_KEY = 'radium-settings';

interface SettingsContextValue {
  settings: RadiumSettings;
  updateSettings: (partial: Partial<RadiumSettings>) => void;
}

const SettingsCtx = createContext<SettingsContextValue | null>(null);

function loadSettings(): RadiumSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Corrupted storage -- fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: RadiumSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable -- silently ignore
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RadiumSettings>(loadSettings);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<RadiumSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  return (
    <SettingsCtx.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsCtx);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
