import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ArtworkRecovery } from './ArtworkRecovery';
import type { ArtworkPlayerProps } from './artworkTypes';
/** Holds React's loading/modal snapshot and keeps the recovery controller's target current before browser events. */
export function useArtworkRecovery(props: ArtworkPlayerProps) {
  const [artworkReloadTick, setArtworkReloadTick] = useState(0);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalText, setMessageModalText] = useState<string | null>(null);
  const [messageModalTitle, setMessageModalTitle] = useState<string | null>(
    null
  );
  const performArtworkReload = useCallback(() => {
    setArtworkReloadTick(n => n + 1);
  }, []);
  const [recovery] = useState(
    () =>
      new ArtworkRecovery(
        {
          setGlobalLoading,
          setShowLoading,
          setShowMessageModal,
          setMessageModalText,
          setMessageModalTitle,
        },
        performArtworkReload
      )
  );
  const {
    previewURL,
    itemIdentity,
    onArtworkExhausted,
    onRegisterArtworkReload,
  } = props;
  useLayoutEffect(() => {
    recovery.updateTarget(previewURL, itemIdentity ?? '', onArtworkExhausted);
  }, [recovery, previewURL, itemIdentity, onArtworkExhausted]);
  useLayoutEffect(() => {
    onRegisterArtworkReload?.(performArtworkReload);
    return () => {
      onRegisterArtworkReload?.(null);
    };
  }, [onRegisterArtworkReload, performArtworkReload]);
  useEffect(
    () => () => {
      recovery.dispose();
    },
    [recovery]
  );
  return {
    recovery,
    artworkReloadTick,
    globalLoading,
    showLoading,
    showMessageModal,
    messageModalText,
    messageModalTitle,
  };
}
/** Reports degradation separately from readiness; same-item reloads retain the signal and retry budget. */
export function usePlaybackDegraded(
  props: ArtworkPlayerProps,
  recovery: ArtworkRecovery,
  report?: (failed: boolean, url?: string) => void
) {
  const currentURL = useRef(props.previewURL);
  const degradedURL = useRef<string | null>(null);
  useLayoutEffect(() => {
    currentURL.current = props.previewURL;
  }, [props.previewURL]);
  const notePlaybackOutcome = useCallback(
    (url: string, failed: boolean) => {
      if (url !== currentURL.current) {
        return;
      }
      const next = failed ? url : null;
      if (degradedURL.current === next) {
        return;
      }
      degradedURL.current = next;
      report?.(failed, url);
    },
    [report]
  );
  useEffect(
    () => () => {
      recovery.resetItem();
      if (degradedURL.current === null) {
        return;
      }
      degradedURL.current = null;
      report?.(false);
    },
    [props.previewURL, props.itemIdentity, recovery, report]
  );
  return notePlaybackOutcome;
}
