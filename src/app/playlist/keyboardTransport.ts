import { DP1DisplayPreference } from '@/models/dp1.model';

export const KEYBOARD_TRANSPORT_SHORTCUTS = [
  'transport',
  'transportControls',
  'nextArtwork',
  'previousArtwork',
  'togglePause',
] as const;

export const isKeyboardTransportEnabled = (
  displayPreference?: DP1DisplayPreference | null,
  hostname?: string
): boolean => {
  const keyboardShortcuts = displayPreference?.interaction?.keyboard ?? [];
  const hasExplicitOptIn = KEYBOARD_TRANSPORT_SHORTCUTS.some(shortcut =>
    keyboardShortcuts.includes(shortcut)
  );

  const isLocalTestingHost =
    hostname === 'localhost' || hostname === '127.0.0.1';

  return hasExplicitOptIn || isLocalTestingHost;
};
