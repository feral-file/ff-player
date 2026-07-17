'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

const shellStyle: CSSProperties = {
  alignItems: 'center',
  background:
    'radial-gradient(circle at 50% 35%, rgba(40, 40, 48, 0.85), rgba(0, 0, 0, 1) 64%)',
  display: 'flex',
  height: '100%',
  justifyContent: 'center',
  overflow: 'hidden',
  position: 'relative',
  width: '100%',
};

const viewerStyle: CSSProperties = {
  backgroundColor: '#000000',
  height: '100%',
  width: '100%',
};

const overlayStyle: CSSProperties = {
  alignItems: 'center',
  color: '#f4f4f4',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, sans-serif',
  gap: '16px',
  inset: 0,
  justifyContent: 'center',
  pointerEvents: 'none',
  position: 'absolute',
  textAlign: 'center',
};

const spinnerStyle: CSSProperties = {
  animation: 'ff-model-spin 1s linear infinite',
  border: '3px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '9999px',
  borderTopColor: '#ffffff',
  height: '42px',
  width: '42px',
};

const CURSOR_LOCK_STYLE_ID = 'ff-model-viewer-cursor-lock';
const CURSOR_LOCK_STYLE_TEXT = `
  :host,
  .container,
  .userInput,
  .userInput *,
  canvas,
  canvas * {
    cursor: none !important;
  }
`;

interface ModelViewerScreenProps {
  src?: string | null;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Render a full-bleed model-viewer surface for glTF / GLB assets.
 *
 * The component owns the custom-element bootstrap and its loading overlay so
 * callers can mount it either directly in the playlist or inside the dedicated
 * `/model-viewer` route without duplicating the WebGL wiring.
 */
export default function ModelViewerScreen({
  src,
  onLoad,
  onError,
}: ModelViewerScreenProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const onErrorRef = useRef(onError);
  const resolvedSrc = useResolvedModelSource(src);
  const hasSource = resolvedSrc.trim().length > 0;
  const [hasBootstrapError, setHasBootstrapError] = useState(false);
  const { isLoaded, hasError } = useModelViewerPlaybackState({
    hasSource,
    onError,
    onLoad,
    resolvedSrc,
    viewerRef,
  });
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    void import('@google/model-viewer').catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      console.error('[ModelViewer] Failed to load model-viewer element:', error);
      setHasBootstrapError(true);
      onErrorRef.current?.();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useModelViewerCursorLock(viewerRef, hasSource);

  return (
    <main style={shellStyle}>
      <style>{`
        @keyframes ff-model-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {hasSource && (
        <model-viewer
          ref={viewerRef}
          alt="3D artwork preview"
          autoplay
          camera-controls
          crossorigin="anonymous"
          exposure="1"
          loading="eager"
          reveal="auto"
          style={{ ...viewerStyle, cursor: 'none' }}
          shadow-intensity="1"
          src={resolvedSrc}
        />
      )}
      {hasSource && !isLoaded && !hasError && !hasBootstrapError && (
        <div style={overlayStyle}>
          <div style={spinnerStyle} />
          <div>
            <div>Loading 3D model</div>
          </div>
        </div>
      )}
      {(hasError || hasBootstrapError) && (
        <div style={overlayStyle}>
          <div>Unable to load 3D model</div>
        </div>
      )}
    </main>
  );
}

function useResolvedModelSource(src?: string | null) {
  const [querySrc, setQuerySrc] = useState<string | null>(null);

  useEffect(() => {
    if (src !== undefined && src !== null) {
      setQuerySrc(null);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setQuerySrc(params.get('src'));
  }, [src]);

  return src ?? querySrc ?? '';
}

function useModelViewerPlaybackState({
  hasSource,
  onError,
  onLoad,
  resolvedSrc,
  viewerRef,
}: {
  hasSource: boolean;
  onError?: () => void;
  onLoad?: () => void;
  resolvedSrc: string;
  viewerRef: RefObject<HTMLElement | null>;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!hasSource) {
      setIsLoaded(false);
      setHasError(true);
      return undefined;
    }

    setIsLoaded(false);
    setHasError(false);

    const viewer = viewerRef.current;
    if (!viewer) {
      return undefined;
    }

    const markLoaded = () => {
      setIsLoaded(true);
      onLoadRef.current?.();
    };
    const handleError = () => {
      setHasError(true);
      onErrorRef.current?.();
    };

    const checkLoaded = () => {
      const modelViewer = viewer as HTMLElement & { loaded?: boolean };
      if (modelViewer.loaded) {
        markLoaded();
        return true;
      }
      return false;
    };

    if (checkLoaded()) {
      return undefined;
    }

    const pollId = window.setInterval(() => {
      if (checkLoaded()) {
        window.clearInterval(pollId);
      }
    }, 100);

    viewer.addEventListener('load', markLoaded);
    viewer.addEventListener('error', handleError);

    return () => {
      window.clearInterval(pollId);
      viewer.removeEventListener('load', markLoaded);
      viewer.removeEventListener('error', handleError);
    };
  }, [hasSource, resolvedSrc, viewerRef]);

  return { isLoaded, hasError };
}

/**
 * Force the model-viewer host and its shadow DOM interaction surfaces to keep
 * the browser cursor hidden while the yellow dot cursor layer is active.
 *
 * The model-viewer controls code rewrites the host cursor during drag states,
 * so we patch the host plus the shadow-root interaction nodes to keep the
 * browser pointer from reappearing over the 3D surface.
 */
export function applyModelViewerCursorLock(viewer: HTMLElement) {
  viewer.style.cursor = 'none';
  const shadowRoot = viewer.shadowRoot;
  if (!shadowRoot) {
    return;
  }

  const existingStyle = shadowRoot.querySelector(
    `style#${CURSOR_LOCK_STYLE_ID}`
  );
  if (existingStyle) {
    return;
  }

  const style = document.createElement('style');
  style.id = CURSOR_LOCK_STYLE_ID;
  style.textContent = CURSOR_LOCK_STYLE_TEXT;
  shadowRoot.appendChild(style);
}

function hasModelViewerCursorLock(viewer: HTMLElement) {
  const shadowRoot = viewer.shadowRoot;
  return (
    viewer.style.cursor === 'none' &&
    shadowRoot !== null &&
    shadowRoot.querySelector(`style#${CURSOR_LOCK_STYLE_ID}`) !== null
  );
}

function useModelViewerCursorLock(
  viewerRef: RefObject<HTMLElement | null>,
  hasSource: boolean
) {
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !hasSource) {
      return undefined;
    }

    let retryId: number | null = null;
    const retryLockCursor = () => {
      if (retryId !== null) {
        window.clearTimeout(retryId);
        retryId = null;
      }

      applyModelViewerCursorLock(viewer);
      if (!hasModelViewerCursorLock(viewer)) {
        retryId = window.setTimeout(() => {
          retryId = null;
          retryLockCursor();
        }, 50);
      }
    };

    retryLockCursor();

    const observer = new MutationObserver(() => {
      if (!hasModelViewerCursorLock(viewer)) {
        retryLockCursor();
      }
    });

    observer.observe(viewer, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => {
      if (retryId !== null) {
        window.clearTimeout(retryId);
      }
      observer.disconnect();
    };
  }, [hasSource, viewerRef]);
}
