'use client';

import { DP1_DEFAULT_INTERMISSION_SECONDS, UI_LAYERS } from '@/constants';
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from 'react';

export interface PlaylistIntermissionProps {
  text: string;
  durationSeconds: number;
  onComplete: () => void;
}

const shell: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#000',
  color: '#fff',
  cursor: 'default',
  zIndex: UI_LAYERS.intermissionOverlay,
};

/** Centered intermission caption (matches standalone note card typography). */
const noteArea: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8vh 8vw',
  textAlign: 'center',
};

const noteText: CSSProperties = {
  margin: 0,
  maxWidth: '28ch',
  fontSize: 'clamp(28px, 3vw, 56px)',
  lineHeight: 1.55,
  fontWeight: 400,
  letterSpacing: '0.01em',
};

/**
 * Full-viewport intermission screen: centered note copy and timed advance.
 * Click or Enter/Space dismisses early. Replaces artwork during intermission
 * (not stacked on top).
 */
export function PlaylistIntermission(
  props: PlaylistIntermissionProps
): ReactElement {
  const { text, durationSeconds, onComplete } = props;
  const safeSeconds = Math.max(
    0.1,
    durationSeconds > 0 && Number.isFinite(durationSeconds)
      ? durationSeconds
      : DP1_DEFAULT_INTERMISSION_SECONDS
  );
  const durationMs = safeSeconds * 1000;

  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const overlayRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    doneRef.current = false;
    const id = window.setTimeout(() => {
      finish();
    }, durationMs);
    return () => {
      window.clearTimeout(id);
    };
  }, [durationMs, finish, text]);

  useEffect(() => {
    // Auto-focus the overlay so keyboard dismissal (Enter/Space) works
    // immediately without requiring user to tab into the element first.
    overlayRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      role="status"
      aria-live="polite"
      style={shell}
      onClick={() => {
        finish();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          finish();
        }
      }}
      tabIndex={0}>
      <div style={noteArea}>
        <p style={noteText}>{text}</p>
      </div>
    </div>
  );
}
