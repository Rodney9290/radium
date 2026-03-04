import { useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import musicSrc from '../assets/audio/radium.mp3';

export function useMusic() {
  const { settings, updateSettings } = useSettings();
  const enabled = settings.backgroundMusic;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio(musicSrc);
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Start playback on first user interaction (browser autoplay policy)
  useEffect(() => {
    if (startedRef.current || !enabled) return;

    const tryPlay = () => {
      if (!enabled || !audioRef.current || startedRef.current) return;
      audioRef.current.play().then(() => {
        startedRef.current = true;
      }).catch(() => {
        // Autoplay blocked — will retry on next interaction
      });
    };

    tryPlay();

    const handler = () => {
      tryPlay();
      if (startedRef.current) {
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

  // Sync play/pause with enabled state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (enabled) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [enabled]);

  // Resilience: periodically check if audio was paused unexpectedly
  useEffect(() => {
    if (!enabled) return;
    const check = setInterval(() => {
      const audio = audioRef.current;
      if (audio && audio.paused && startedRef.current) {
        audio.play().catch(() => {});
      }
    }, 3000);
    return () => clearInterval(check);
  }, [enabled]);

  const toggle = () => {
    updateSettings({ backgroundMusic: !enabled });
  };

  return { enabled, toggle };
}
