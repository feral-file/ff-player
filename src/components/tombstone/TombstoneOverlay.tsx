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

// Visual spec from Figma "FF1 Art Computer" frame 3811-14394 ("Tombstone
// 1.0"): white label flush to the bottom-left corner, width hugging its
// content, PP Mori 12px with 1.4 line-height, 10px padding and internal gap.
// The timer bar is a 1px #E3E3E3 track across the label's top whose #A0A0A0
// fill depletes over the auto-dismiss window — the visible countdown.
//
// Frame px are converted to vmin by `designPx` (see ./designPx) so the label
// holds its designed proportion at any output resolution and orientation —
// vmin, not vh, because a rotated portrait wall reports a viewport whose
// height is the artwork's long side (see designPx.test.ts for the contract).

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: designPx(10),
  padding: designPx(10),
  backgroundColor: '#FFFFFF',
  fontFamily: "'PP Mori', sans-serif",
  // Deviation from the frame's 12px, flagged for B&F review: the frame was
  // designed on a desktop canvas, and 12px-at-720 (18px on a 1080p wall)
  // sits below TV-distance legibility floors. 16px-at-720 (24px @1080p)
  // clears the floor while keeping the label quieter than a caption card.
  fontSize: designPx(16),
  fontWeight: 400,
  lineHeight: 1.4,
  color: '#000000',
  // Text-wrap cap, sized by the viewport's short edge like every other
  // dimension here. A viewport-width `60%` binds to the *long* axis on a
  // rotated portrait wall — 648px of a 1080x1920 viewport — while the type it
  // wraps stays vmin, so long artist/title/curator strings wrapped far earlier
  // in portrait than in landscape. 640 frame px is half the 1280 design frame
  // (so landscape is visually unchanged) and, at 88.8889vmin, can never exceed
  // the viewport width in either orientation: vmin <= vw by definition.
  // The label's own width still hugs its content; this only bounds the wrap.
  maxWidth: designPx(640),
  pointerEvents: 'none',
  zIndex: 20,
  transition: 'opacity 300ms ease',
};

const trackStyle: CSSProperties = {
  width: '100%',
  height: `max(1px, ${designPx(1)})`,
  backgroundColor: '#E3E3E3',
};

const fillStyle: CSSProperties = {
  height: '100%',
  backgroundColor: '#A0A0A0',
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
};

const curatedStyle: CSSProperties = {
  color: '#A0A0A0',
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
      style={{ ...containerStyle, opacity: visible ? 1 : 0 }}>
      {mode === TombstoneMode.Timed && visible && (
        <TimerBar seconds={TOMBSTONE_AUTO_DISMISS_SECONDS} runKey={runKey} />
      )}
      {/* Timer bar, the artist+title info block, and the curated line are
          separate flex children per the design frame — the container's
          column gap is what produces the visible space above "Curated by". */}
      <div>
        {artistName && <div>{artistName}</div>}
        <div style={titleStyle}>{title}</div>
      </div>
      {curatorName && <div style={curatedStyle}>Curated by: {curatorName}</div>}
    </div>
  );
}
