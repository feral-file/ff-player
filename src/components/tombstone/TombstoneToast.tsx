'use client';

import { CSSProperties, useEffect, useState } from 'react';

/** How long the confirmation stays on screen. */
export const TOMBSTONE_TOAST_DURATION_MS = 3000;

// Transient confirmation shown on the FF1 when the tombstone setting changes
// from the mobile app (feral-file#3452: "Confirming the state shows a toast
// on the FF1"). The Figma frame shows white PP Mori 12px text over the
// artwork; exact placement isn't specified in the tombstone frame, so
// bottom-center is an approximation flagged for design review in the PR.
const toastStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 40,
  transform: 'translateX(-50%)',
  fontFamily: "'PP Mori', sans-serif",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.4,
  color: '#FFFFFF',
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
  pointerEvents: 'none',
  zIndex: 21,
  whiteSpace: 'nowrap',
};

/**
 * Auto-hiding confirmation line. The parent passes the latest confirmation
 * text (or null before any change); each new text restarts the display
 * window. Only mode *changes* produce a text, so identical consecutive
 * values — which would not retrigger the effect — cannot occur upstream.
 */
export default function TombstoneToast({ text }: { text: string | null }) {
  const [visibleText, setVisibleText] = useState<string | null>(null);

  useEffect(() => {
    if (!text) {
      return;
    }
    setVisibleText(text);
    const timeout = setTimeout(() => {
      setVisibleText(null);
    }, TOMBSTONE_TOAST_DURATION_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [text]);

  if (!visibleText) {
    return null;
  }

  return (
    <div data-testid="tombstone-toast" style={toastStyle}>
      {visibleText}
    </div>
  );
}
