import { LoopMode } from '@/models/cast_info.model';

/** Set of known `LoopMode` string values from cast / remote payloads. */
export const VALID_LOOP_MODES = new Set<string>(Object.values(LoopMode));

/**
 * Maps cast / status loop mode strings onto `LoopMode`. Unknown values fall
 * back to `playlist` so legacy clients keep the historical default.
 */
export function coerceLoopMode(raw: string | undefined): LoopMode {
  return raw && VALID_LOOP_MODES.has(raw) ? (raw as LoopMode) : LoopMode.playlist;
}
