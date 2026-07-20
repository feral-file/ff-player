'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DP1Tombstone } from '@/models/dp1.model';

const DEFAULT_HOLD_SECONDS = 5;

export interface TombstoneProps {
  data?: DP1Tombstone;
  /** Falls back here when `data.title` is absent. */
  fallbackTitle?: string;
  /**
   * Stable identity of the current work. When it changes a new work has
   * loaded, so the tombstone shows again and re-arms its hold timer.
   */
  itemIdentity?: string;
}

/** True when the tombstone carries at least one thing worth showing. */
function hasContent(
  data: DP1Tombstone | undefined,
  fallbackTitle?: string
): boolean {
  return [
    data?.title,
    fallbackTitle,
    data?.makers?.length,
    data?.basedOn?.length,
    data?.source,
    data?.owner,
  ].some(Boolean);
}

const plate: CSSProperties = {
  position: 'absolute',
  left: '4vw',
  bottom: '5vh',
  maxWidth: '42ch',
  padding: '1.4vh 1.8vw',
  borderRadius: 12,
  // Soft scrim so white text stays legible over any artwork, without a hard
  // box. The art stays the subject; the label is a quiet companion.
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  color: '#fff',
  pointerEvents: 'none',
  zIndex: 50,
  transition: 'opacity 650ms ease', // matches ArtworkPlayer FADE_IN_OUT_DURATION_MS
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(20px, 2.2vw, 34px)',
  fontWeight: 500,
  lineHeight: 1.2,
  letterSpacing: '0.005em',
};

const makerRow: CSSProperties = {
  marginTop: '1.1vh',
  display: 'flex',
  flexDirection: 'column',
};

const roleLabel: CSSProperties = {
  fontSize: 'clamp(10px, 0.9vw, 13px)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(255, 255, 255, 0.55)',
};

const makerName: CSSProperties = {
  fontSize: 'clamp(14px, 1.2vw, 19px)',
  color: 'rgba(255, 255, 255, 0.95)',
  lineHeight: 1.25,
};

const lineMuted: CSSProperties = {
  marginTop: '1.1vh',
  fontSize: 'clamp(12px, 1vw, 16px)',
  color: 'rgba(255, 255, 255, 0.7)',
  lineHeight: 1.35,
};

const footer: CSSProperties = {
  marginTop: '1.4vh',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4em 1.2em',
  fontSize: 'clamp(11px, 0.95vw, 14px)',
  color: 'rgba(255, 255, 255, 0.6)',
  letterSpacing: '0.02em',
};

/**
 * Museum-style tombstone: a brief wall label over a freshly-loaded work.
 *
 * Shows multi-author credit in distinct roles (the visual maker and the
 * curatorial author are never collapsed into one "artist"), the work's source,
 * and its on-chain provenance/owner — then fades out after a few seconds so the
 * artwork shows clean. Calm and art-first: no notification chrome, no badge.
 */
export default function Tombstone({
  data,
  fallbackTitle,
  itemIdentity,
}: TombstoneProps) {
  const [shown, setShown] = useState(false);
  const doneRef = useRef(false);

  const holdSeconds =
    data?.durationSeconds && data.durationSeconds > 0
      ? data.durationSeconds
      : DEFAULT_HOLD_SECONDS;

  // Re-show and re-arm the hold timer whenever a new work loads.
  useEffect(() => {
    if (!hasContent(data, fallbackTitle)) {
      setShown(false);
      return;
    }
    doneRef.current = false;
    setShown(true);
    const hideId = window.setTimeout(() => {
      doneRef.current = true;
      setShown(false);
    }, holdSeconds * 1000);
    return () => {
      window.clearTimeout(hideId);
    };
  }, [itemIdentity, data, fallbackTitle, holdSeconds]);

  if (!hasContent(data, fallbackTitle)) {
    return null;
  }

  const title = data?.title ?? fallbackTitle;
  const makers = data?.makers ?? [];
  const basedOn = data?.basedOn ?? [];
  const source = data?.source;
  const owner = data?.owner;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ ...plate, opacity: shown ? 1 : 0 }}>
      {title && <p style={titleStyle}>{title}</p>}

      {makers.map((m, i) => (
        <div key={`${m.role}:${m.name}:${String(i)}`} style={makerRow}>
          <span style={roleLabel}>{m.role}</span>
          <span style={makerName}>{m.name}</span>
        </div>
      ))}

      {basedOn.length > 0 && (
        <div style={lineMuted}>Based on {basedOn.join('  ·  ')}</div>
      )}

      {[source, owner].some(Boolean) && (
        <div style={footer}>
          {source && <span>{source}</span>}
          {owner && <span>Held by {owner}</span>}
        </div>
      )}
    </div>
  );
}
