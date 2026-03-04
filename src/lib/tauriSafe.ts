// Safe wrappers for Tauri APIs — gracefully degrade when running in a browser dev preview.

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

const NOT_AVAILABLE = new Error('Tauri backend not available');

/**
 * Safe `invoke`: catches both synchronous throws (missing __TAURI_INTERNALS__)
 * and async rejections so callers always get a clean rejected promise.
 */
export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return tauriInvoke<T>(cmd, args).catch(() => {
      throw NOT_AVAILABLE;
    });
  } catch {
    return Promise.reject(NOT_AVAILABLE);
  }
}

/**
 * Safe `listen`: returns a no-op unlisten when Tauri is unavailable.
 */
export const listen: typeof tauriListen = ((...args: Parameters<typeof tauriListen>) => {
  try {
    return tauriListen(...args);
  } catch {
    return Promise.resolve(() => {});
  }
}) as typeof tauriListen;
