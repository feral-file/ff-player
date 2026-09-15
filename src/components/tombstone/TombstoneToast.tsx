'use client';

import { CSSProperties, useEffect, useState } from 'react';
import { designPx } from './designPx';

/** How long the confirmation stays on screen. */
export const TOMBSTONE_TOAST_DURATION_MS = 3000;

// Transient confirmation shown on the FF1 when the tombstone setting changes
// from the mobile app (feral-file#3452: "Confirming the state shows a toast
// on the FF1").
//
// Styled as a card rather than bare text, matching how ff-app presents its own
// toasts in `lib/widgets/overlays/app_global_overlay_layer.dart`: solid black
// fill, 12px corner radius, 16/12 padding, white body text, and a two-layer
// drop shadow. White text alone — even with a text shadow — was unreadable
// over light artworks, which is the whole point of a confirmation.
//
// Type is 16px-at-720 to match the label in TombstoneOverlay. A 12px line is
// below TV-distance legibility on a 1080p wall, and contrast does not fix a
// size problem.
//
// Exported: the daemon-driven notice (src/components/toast/PlayerToast) uses
// this exact style so the two toasts are one visual system. It stays in this
// directory on purpose — sizingContract.test.ts scans it, so every dimension
// keeps to designPx (vmin) and the 80% cap stays the allowlisted inert net.
// PlayerToast's longest notice is ~26 em, which at vmin type fits inside that
// cap on every documented viewport (PlayerToast.sizing.test.ts pins the
// budget); a vh-scaled variant would not on a portrait wall.
export const toastStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: designPx(40),
  transform: 'translateX(-50%)',
  // Deliberately not `designPx`: the toast's fixed confirmation strings never
  // approach this cap (nowrap keeps them one line), so the value is an inert
  // safety net, not part of the vmin sizing contract the label follows.
  maxWidth: '80%',
  backgroundColor: '#000000',
  borderRadius: designPx(12),
  padding: `${designPx(12)} ${designPx(16)}`,
  boxShadow: `0 ${designPx(14)} ${designPx(28)} rgba(0, 0, 0, 0.32), 0 ${designPx(3)} ${designPx(8)} rgba(0, 0, 0, 0.22)`,
  fontFamily: "'PP Mori', sans-serif",
  fontSize: designPx(16),
  fontWeight: 400,
  lineHeight: 1.4,
  color: '#FFFFFF',
  textAlign: 'center',
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
