import { CastCommand } from '@/models';
import {
  Reply,
  UpdateSeriesPlaybackRequest,
} from '@/models/cast_request_reply.model';
import DeviceManager from '@/utils/DeviceManager';
import { VALID_SERIES_PLAYBACK } from '@/utils/seriesPlayback';
import type { PlaybackSession } from './PlaybackSession';

/**
 * Sets (or clears, with null/absent `mode`) the persisted device-level
 * series playback override — how a `seriesRegistry` item plays on this
 * screen whatever the item asked for. Cached synchronously before the
 * IndexedDB write settles, then castInfo is republished so the playlist
 * route re-selects the active slot against the new value without
 * restarting playback. Same shape, and same reasons, as
 * `PlaybackSession.updateDefaultDuration`.
 *
 * Its own file, not a `PlaybackSession` method, purely to keep that class
 * under the project's line budget — `session` only needs the two public
 * methods every other cast-command setter in `PlaybackSession` already
 * calls on itself.
 */
export function applyUpdateSeriesPlayback(
  session: Pick<PlaybackSession, 'getCastInfo' | 'setCastInfo'>,
  request: UpdateSeriesPlaybackRequest | undefined
): Reply {
  // A missing request envelope means "clear" — same as an explicit null.
  const raw = request?.mode ?? null;
  if (raw !== null && !VALID_SERIES_PLAYBACK.has(raw)) {
    console.error('[CanvasService] Invalid series playback mode:', raw);
    return { ok: false };
  }

  console.log('[CanvasService] updateSeriesPlayback', raw);
  DeviceManager.setSeriesPlayback(raw).catch((error: unknown) => {
    console.error('[CanvasService] Error persisting series playback:', error);
  });

  const currentCast = session.getCastInfo();
  if (currentCast) {
    session.setCastInfo({
      ...currentCast,
      castCommand: CastCommand.updateSeriesPlayback,
    });
  }

  return { ok: true };
}
