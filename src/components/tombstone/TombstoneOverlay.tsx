'use client';

import { TombstoneMode } from '@/models/display_settings.model';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { designPx } from './designPx';

/**
 * Auto-dismiss window for `TombstoneMode.Timed` (feral-file#3452 default).
 * Exported so the status surface and future ff-app confirmations can quote
 * the same number instead of hardcoding a second copy.
 */
export const TOMBSTONE_AUTO_DISMISS_SECONDS = 30;

// Visual language: a museum wall plaque rather than a UI card (supersedes the
// flush-corner "Tombstone 1.0" spec from Figma frame 3811-14394, restyled per
// design direction 2026-08: the label should read as a gallery object). Three
// moves carry the effect:
//   1. A 40px stand-off from the corner — wall labels are never flush to the
//      frame; the surrounding "wall" is half the plaque feel.
//   2. Warm paper white (#FAF8F4) with a soft two-layer drop shadow so the
//      card separates from light artworks by depth, not by border.
//   3. A wider type hierarchy: artist line, larger bold-italic title, and a
//      letterspaced small-caps curator credit.
// The countdown track moves from the card's top edge (which read as a loading
// bar) to a quiet hairline along the bottom edge.
//
// Frame px are converted to vh by `designPx` (see ./designPx) so the label
// holds its designed proportion at any output resolution.

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: designPx(40),
  bottom: designPx(40),
  display: 'flex',
  flexDirection: 'column',
  gap: designPx(14),
  padding: `${designPx(20)} ${designPx(24)} ${designPx(22)}`,
  backgroundColor: '#FAF8F4',
  // Lift tuned on the wall 2026-08: opacity carries the float, blur stays
  // tight so the dark halo does not bleed into the artwork as a vignette.
  boxShadow: `0 ${designPx(12)} ${designPx(32)} rgba(0, 0, 0, 0.40), 0 ${designPx(3)} ${designPx(8)} rgba(0, 0, 0, 0.24)`,
  fontFamily: "'PP Mori', sans-serif",
  // 16px-at-720 (24px @1080p) is the TV-distance legibility floor for the
  // artist line; the title sits a step above it (see titleStyle).
  fontSize: designPx(16),
  fontWeight: 400,
  lineHeight: 1.4,
  letterSpacing: '0.015em',
  color: '#1A1916',
  maxWidth: '50%',
  pointerEvents: 'none',
  zIndex: 20,
  transition: 'opacity 400ms ease, transform 400ms ease',
};

// The depleting track hugs the plaque's bottom edge — inside the card but
// outside the text block — so the countdown reads as the label quietly
// receding instead of a progress bar loading.
const trackStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: `max(1px, ${designPx(1.5)})`,
  backgroundColor: '#EDEAE2',
};

const fillStyle: CSSProperties = {
  height: '100%',
  backgroundColor: '#C4BFB4',
};

// Bold italic title over a regular-weight artist line, matching how ff-app
// renders the same pair everywhere else: `artwork_credit.dart` styles the
// artist w400/normal and the title w700/italic, and the now-displaying bar
// does the same. The wall and the app should not disagree about what an
// artwork title looks like.
//
// The 700/italic face now ships in `public/fonts` (globals.css), so these are
// real weights rather than browser-synthesized ones.
const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontStyle: 'italic',
  fontSize: designPx(20),
  marginTop: designPx(4),
};

// Letterspaced small caps in a warm grey — the museum-credit register. The
// source string keeps its original casing ("Curated by: X") so tests and
// screen readers see prose; only the rendering is uppercased.
const curatedStyle: CSSProperties = {
  fontSize: designPx(14),
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#8A857C',
};

/**
 * Depleting countdown line. Rendered 100% wide, then collapsed to 0 with a
 * linear width transition lasting the full window. `runKey` remounts the
 * animation whenever the playing item changes so each artwork gets a fresh
 * countdown. The double requestAnimationFrame guarantees the browser paints
 * the full-width state before the transition target is applied.
 */
function TimerBar({ seconds, runKey }: { seconds: number; runKey: string }) {
  const [depleting, setDepleting] = useState(false);

  useEffect(() => {
    setDepleting(false);
    let inner: number | undefined;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setDepleting(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner !== undefined) {
        cancelAnimationFrame(inner);
      }
    };
  }, [runKey]);

  return (
    <div style={trackStyle}>
      <div
        style={{
          ...fillStyle,
          width: depleting ? '0%' : '100%',
          transition: depleting ? `width ${String(seconds)}s linear` : 'none',
        }}
      />
    </div>
  );
}

/**
 * Museum-style label overlaid on the playing artwork (feral-file#3452).
 * Purely presentational: the owning route decides the mode (device display
 * settings) and supplies whatever metadata it has. Lines degrade gracefully —
 * no artist means no artist line, no curator means no "Curated by" line, and
 * no title at all means the label never renders (an unlabeled tombstone is
 * noise, not information).
 */
export default function TombstoneOverlay({
  mode,
  itemKey,
  title,
  artistName,
  curatorName,
}: {
  mode: TombstoneMode;
  // Stable identity of the playing item; every change restarts the
  // visibility window and countdown.
  itemKey: string;
  title?: string;
  artistName?: string;
  curatorName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // The visibility window and the TimerBar depletion must share one clock.
  // Keying either on the title *string* would desync them: a ref-manifest
  // title upgrade landing mid-window would restart the window (or, past the
  // window, resurrect the label) while the bar kept its original schedule.
  // `hasTitle` only flips when the label first becomes renderable, so a
  // richer title swaps text in place without touching the countdown.
  const hasTitle = Boolean(title);
  const runKey = `${itemKey}:${String(hasTitle)}`;

  useEffect(() => {
    clearTimeout(hideTimeoutRef.current);
    if (mode === TombstoneMode.Off || !hasTitle) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (mode === TombstoneMode.Timed) {
      hideTimeoutRef.current = setTimeout(() => {
        setVisible(false);
      }, TOMBSTONE_AUTO_DISMISS_SECONDS * 1000);
    }
    return () => {
      clearTimeout(hideTimeoutRef.current);
    };
  }, [mode, runKey, hasTitle]);

  if (mode === TombstoneMode.Off || !title) {
    return null;
  }

  return (
    <div
      data-testid="tombstone-overlay"
      aria-hidden={!visible}
      style={{
        ...containerStyle,
        opacity: visible ? 1 : 0,
        // The hidden state sits 8px low so appearing reads as a settle-up
        // and dismissal as a sink — one directional gesture, not a blink.
        transform: visible ? 'translateY(0)' : `translateY(${designPx(8)})`,
      }}>
      {/* The artist+title info block and the curated line are separate flex
          children — the container's column gap is what produces the visible
          space above "Curated by". The timer track is absolutely positioned
          on the card's bottom edge, so its DOM position carries no layout. */}
      <div>
        {artistName && <div>{artistName}</div>}
        <div style={titleStyle}>{title}</div>
      </div>
      {curatorName && <div style={curatedStyle}>Curated by: {curatorName}</div>}
      {mode === TombstoneMode.Timed && visible && (
        <TimerBar seconds={TOMBSTONE_AUTO_DISMISS_SECONDS} runKey={runKey} />
      )}
    </div>
  );
}
