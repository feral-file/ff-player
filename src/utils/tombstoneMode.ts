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

/**
 * FF1-side confirmation copy for a tombstone mode change (the issue specifies
 * the Timed wording verbatim; On/Off follow the app control's state labels).
 */
export function tombstoneToastText(mode: TombstoneMode): string {
  switch (mode) {
    case TombstoneMode.Timed:
      return "Tombstone timer set to '30s'";
    case TombstoneMode.On:
      return "Tombstone set to 'On'";
    case TombstoneMode.Off:
      return "Tombstone set to 'Off'";
  }
}
