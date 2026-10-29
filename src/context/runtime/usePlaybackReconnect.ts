import { useCallback, useEffect, useState } from 'react';
import { PlaybackReconnect } from './PlaybackReconnect';
/** The renderer reports the failing URL synchronously; only state/notification changes restart the effect. */
export function usePlaybackReconnect(onlineSignal: number, isOnline: boolean) {
  const [playbackDegraded, setDegraded] = useState(false);
  const [recovery] = useState(() => new PlaybackReconnect(isOnline));
  const setPlaybackDegraded = useCallback(
    (degraded: boolean, url?: string) => {
      recovery.report(degraded, url);
      setDegraded(degraded);
    },
    [recovery]
  );
  useEffect(
    () => recovery.update(playbackDegraded, isOnline),
    [recovery, onlineSignal, playbackDegraded, isOnline]
  );
  return { playbackDegraded, setPlaybackDegraded };
}
