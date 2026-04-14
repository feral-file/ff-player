import type { CastInfo } from '@/models';

/**
 * Older clients and stored payloads may still carry playback timeline keys that
 * are no longer part of the CastInfo contract. Strip them before persisting or
 * holding cast state in memory so downstream code does not see stale fields.
 */
interface LegacyCastPlaybackTimeline {
  startTime?: number;
  elapsedTime?: number;
  remainTime?: number;
}

/**
 * Strip legacy playback timeline fields from cast info.
 * @param castInfo - The cast info to strip.
 * @returns The stripped cast info.
 */
export function stripLegacyCastPlaybackTimeline(castInfo: CastInfo): CastInfo {
  const {
    startTime: _startTime,
    elapsedTime: _elapsedTime,
    remainTime: _remainTime,
    ...cleanCastInfo
  } = castInfo as CastInfo & LegacyCastPlaybackTimeline;
  void _startTime;
  void _elapsedTime;
  void _remainTime;
  return cleanCastInfo;
}
