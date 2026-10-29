import { canvasService } from '@/services/CanvasService';
import type { Dispatch, SetStateAction } from 'react';
export interface FallbackRequest {
  active: boolean;
  nonce: number;
}
const FALLBACK_PLAYLIST_RETRY_INITIAL_MS = 5_000;
const FALLBACK_PLAYLIST_RETRY_MAX_MS = 60_000;
/** Owns fallback request cancellation, successful-cast identity, and each retry attempt's lifetime. */
export class FallbackPlaylist {
  private stoodDown = false;
  private lastCastURL: string | null = null;
  constructor(
    private readonly publish: Dispatch<SetStateAction<FallbackRequest>>
  ) {}
  request = () => {
    this.stoodDown = false;
    this.publish(prev => ({ active: true, nonce: prev.nonce + 1 }));
  };
  standDown = () => {
    // Cancel synchronously: it must be visible to an in-flight attempt's shouldAbort
    // in this same task; the state update below only stops FUTURE effect
    // runs and clears the armed retry timer once React flushes.
    this.stoodDown = true;
    // The wall no longer shows a fallback cast, so a config change landing
    // later must NOT supersede — it would re-cast the default playlist
    // over the controller's content, or relight (and navigate awake) a
    // disconnected or sleeping wall.
    this.lastCastURL = null;
    this.publish(prev => (prev.active ? { ...prev, active: false } : prev));
  };
  /**
   * The single resolver for displayDefaultPlaylist, including boot fallback.
   * Online notifications restart this loop immediately and reset its backoff.
   * It deliberately races remote-config reads: a slow config must not leave
   * the wall empty. A successful old URL is superseded once new config lands.
   */
  start(
    url: string,
    request: FallbackRequest,
    navigate: (path: string) => void
  ) {
    if (!(url && request.active)) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelayMs = FALLBACK_PLAYLIST_RETRY_INITIAL_MS;

    const attempt = async () => {
      console.log('[AppContext] Fallback default playlist attempt');
      // The hook lets CanvasService drop the cast between its fetch
      // resolving and the commit: an explicit cast can land while the fetch
      // is in flight, and the `cancelled` check below runs only after the
      // commit already happened inside castPlaylistByURL. The controller flag is the
      // synchronous half — `cancelled` alone flips only when React runs this
      // effect's cleanup, which can be after the fetch resolves.
      const casted = await canvasService.castPlaylistByURL(
        url,
        () => cancelled || this.stoodDown
      );
      if (casted) {
        // Record what the wall is now showing BEFORE the cancelled check
        // and regardless of the nonce guard below: even when a newer effect
        // run or request supersedes this one, the cast itself committed,
        // and the supersede effect compares against the content actually on
        // screen. (A superseding run that casts again overwrites this with
        // its own URL.)
        this.lastCastURL = url;
      }
      if (cancelled) {
        return;
      }
      if (casted) {
        this.publish(prev =>
          prev.nonce === request.nonce ? { ...prev, active: false } : prev
        );
        if (window.location.pathname !== '/') {
          navigate('/');
        }
        return;
      }
      console.log(
        '[AppContext] Fallback playlist failed, retrying in ms:',
        retryDelayMs
      );
      retryTimer = setTimeout(() => void attempt(), retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, FALLBACK_PLAYLIST_RETRY_MAX_MS);
    };

    void attempt();
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }
  /** Wait for the active loop to settle so a config change cannot cast twice. */
  supersede(url: string, active: boolean) {
    const lastFallbackCastURL = this.lastCastURL;
    if (
      !active &&
      lastFallbackCastURL !== null &&
      url &&
      url !== lastFallbackCastURL
    ) {
      console.log('[AppContext] Config changed, superseding fallback cast');
      this.request();
    }
  }
}
