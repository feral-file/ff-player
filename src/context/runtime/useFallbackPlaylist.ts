import { CustomEventName } from '@/models/custom_event';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FallbackPlaylist, FallbackRequest } from './FallbackPlaylist';
/** React publishes request generations; the fallback owner cancels synchronously at command boundaries. */
export function useFallbackPlaylist(
  url: string,
  onlineSignal: number,
  router: ReturnType<typeof useRouter>
) {
  const [request, publish] = useState<FallbackRequest>({
    active: false,
    nonce: 0,
  });
  const [fallback] = useState(() => new FallbackPlaylist(publish));
  useEffect(
    () =>
      fallback.start(url, request, path => {
        router.push(path);
      }),
    [fallback, url, request, onlineSignal, router]
  );
  useEffect(() => {
    fallback.supersede(url, request.active);
  }, [fallback, url, request.active]);
  return fallback;
}
/** Register command listeners before hydration can resolve a deferred default request. */
export function useFallbackCommands(fallback: FallbackPlaylist) {
  useEffect(() => {
    window.addEventListener(
      CustomEventName.ExplicitPlaylistCast,
      fallback.standDown
    );
    window.addEventListener(CustomEventName.PlaybackHalted, fallback.standDown);
    return () => {
      window.removeEventListener(
        CustomEventName.ExplicitPlaylistCast,
        fallback.standDown
      );
      window.removeEventListener(
        CustomEventName.PlaybackHalted,
        fallback.standDown
      );
    };
  }, [fallback]);
  useEffect(() => {
    const request = () => {
      console.log('[AppContext] displayDefaultPlaylist requested');
      fallback.request();
    };
    window.addEventListener(CustomEventName.DisplayDefaultPlaylist, request);
    return () => {
      window.removeEventListener(
        CustomEventName.DisplayDefaultPlaylist,
        request
      );
    };
  }, [fallback]);
}
