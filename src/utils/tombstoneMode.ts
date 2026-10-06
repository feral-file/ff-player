import { TombstoneMode } from '@/models/display_settings.model';

/** Set of known `TombstoneMode` string values from cast / status payloads. */
export const VALID_TOMBSTONE_MODES = new Set<string>(
  Object.values(TombstoneMode)
);

/**
 * Maps cast / persisted tombstone strings onto `TombstoneMode`. The wire
 * value comes from ff-app builds that ship independently of this player
 * (feral-file#3452 defers the control to a separate PR), so unknown or
 * missing values fall back to the product default (`Timed`) instead of
 * leaking through as a permanently-visible label — mirrors `coerceLoopMode`.
 */
export function coerceTombstoneMode(raw: string | undefined): TombstoneMode {
  return raw && VALID_TOMBSTONE_MODES.has(raw)
    ? (raw as TombstoneMode)
    : TombstoneMode.Timed;
}
