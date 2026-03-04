import { useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';

import trackRadium from '../assets/audio/radium.mp3';
import trackDarkAmbient from '../assets/audio/dark-ambient.mp3';
import trackElectrofreak from '../assets/audio/electrofreak.mp3';
import trackElectroshuffleDark from '../assets/audio/electroshuffle-dark.mp3';
import trackGhostTown from '../assets/audio/ghost-town.mp3';
import trackPsychedelicCrater from '../assets/audio/psychedelic-crater.mp3';
import trackSystemIsDown from '../assets/audio/system-is-down.mp3';
import trackTechweather from '../assets/audio/techweather.mp3';

const TRACKS = [
  trackRadium,
  trackDarkAmbient,
  trackElectrofreak,
  trackElectroshuffleDark,
  trackGhostTown,
  trackPsychedelicCrater,
  trackSystemIsDown,
  trackTechweather,
];

/** Fisher-Yates shuffle (returns new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Module-level singleton so multiple useMusic() calls share one player ──

let audio: HTMLAudioElement | null = null;
let playlist: string[] = shuffle(TRACKS);
let trackIndex = 0;
let started = false;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(playlist[0]);
    audio.loop = false;
    audio.volume = 0.3;
    audio.addEventListener('ended', advanceTrack);
  }
  return audio;
}

function advanceTrack() {
  trackIndex += 1;
  if (trackIndex >= playlist.length) {
    playlist = shuffle(TRACKS);
    trackIndex = 0;
  }
  const a = getAudio();
  a.src = playlist[trackIndex];
  a.play().catch(() => {});
}

export function useMusic() {
  const { settings, updateSettings } = useSettings();
  const enabled = settings.backgroundMusic;

  // Start playback on first user interaction (browser autoplay policy)
  useEffect(() => {
    if (started || !enabled) return;

    const tryPlay = () => {
      if (!enabled || started) return;
      getAudio().play().then(() => {
        started = true;
      }).catch(() => {});
    };

    tryPlay();

    const handler = () => {
      tryPlay();
      if (started) {
        document.removeEventListener('click', handler);
        document.removeEventListener('keydown', handler);
      }
    };

    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [enabled]);

  // Sync volume with settings
  useEffect(() => {
    getAudio().volume = settings.musicVolume / 100;
  }, [settings.musicVolume]);

  // Sync play/pause with enabled state
  useEffect(() => {
    const a = getAudio();
    if (enabled) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [enabled]);

  // Resilience: periodically check if audio was paused unexpectedly
  useEffect(() => {
    if (!enabled) return;
    const check = setInterval(() => {
      const a = getAudio();
      if (a.paused && started) {
        a.play().catch(() => {});
      }
    }, 3000);
    return () => clearInterval(check);
  }, [enabled]);

  const toggle = useCallback(() => {
    updateSettings({ backgroundMusic: !enabled });
  }, [enabled, updateSettings]);

  const skip = useCallback(() => {
    if (!enabled) return;
    advanceTrack();
  }, [enabled]);

  return { enabled, toggle, skip };
}
