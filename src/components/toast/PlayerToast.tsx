'use client';

import { useEffect, useState } from 'react';
import {
  CustomEventName,
  PlayerToastDetail,
  PlayerToastNotice,
} from '@/models/custom_event';
import { toastStyle } from '../tombstone/TombstoneToast';

/** How long a daemon-driven notice stays on screen. */
export const PLAYER_TOAST_DURATION_MS = 5000;

/**
 * Copy for each notice, owned here rather than sent by the daemon so it goes
 * through the copy lint and stays localizable. Rendered verbatim on the wall
 * at TV distance: short, one line, no jargon.
 */
export const PLAYER_TOAST_COPY: Record<PlayerToastNotice, string> = {
  [PlayerToastNotice.SignatureInvalid]:
    'Playlist signature could not be verified.',
  [PlayerToastNotice.SignatureUnsigned]: 'This playlist is not signed.',
  [PlayerToastNotice.SignatureRejected]:
    'Playlist not shown: it did not pass signature verification.',
};

/**
 * Transient, self-dismissing notice driven by the `playerToast` CDP command
 * (feral-file/ffos-user#307). Mounted app-wide in AppWrapper so it exists on
 * every route and during boot; it claims no overlay ownership and sits under
 * the full-screen setup/pairing panels, so it never needs arbitration. Each
 * accepted command restarts the display window — the handler's `seq` makes a
 * repeated identical notice a fresh event — and the newest notice replaces
 * the text immediately. Shares TombstoneToast's style (vmin-scaled, see the
 * tombstone sizing contract) so both toasts read as one system.
 */
export default function PlayerToast() {
  const [visible, setVisible] = useState<PlayerToastDetail | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const { detail } = event as CustomEvent<PlayerToastDetail>;
      setVisible(detail);
    };
    window.addEventListener(CustomEventName.PlayerToast, onToast);
    return () => {
      window.removeEventListener(CustomEventName.PlayerToast, onToast);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timeout = setTimeout(() => {
      setVisible(null);
    }, PLAYER_TOAST_DURATION_MS);
    return () => {
      clearTimeout(timeout);
    };
    // Each event is a fresh detail object (with its own seq), so this effect
    // re-runs — and the window restarts — even when the notice repeats.
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div data-testid="player-toast" style={toastStyle}>
      {PLAYER_TOAST_COPY[visible.notice]}
    </div>
  );
}
