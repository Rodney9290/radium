import { useCallback } from 'react';
import { useSettings } from './useSettings';

/**
 * Request notification permission from the browser (WKWebView on macOS).
 * Returns true if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Hook that provides a `notify` function respecting the user's notifications setting.
 * Fires a system notification if enabled and permission is granted.
 */
export function useNotifications() {
  const { settings } = useSettings();

  const notify = useCallback((title: string, body?: string) => {
    if (!settings.notifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, silent: false });
    } catch {
      // Notification API unavailable in this WebView context — silently ignore
    }
  }, [settings.notifications]);

  return { notify };
}
