import { MessageModalType } from '@/models';
import Hls from 'hls.js';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as Sentry from '@sentry/nextjs';
import Loading from '../loading/loading';
import { useAppContext } from '@/context/AppContext';
import styles from './styles.module.scss';
import MessageModal from '../MessageModal';
import { CLIENT_BANDWIDTH_HINT } from '@/constants';
import { createMediaLoader, BlobLoadedMediaType } from '@/utils/mediaLoader';
import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseObject,
  FileUseVideo,
  MIMETypeAudio,
  MIMETypeImage,
  MIMETypeObject,
  MIMETypePdf,
  MIMETypeSvg,
  MIMETypeVideo,
  MIMETypeUseStream as MIMETypeStreamVideo,
  MITETypeIframe,
  PreviewHTMLTag,
} from '@/models';

import {
  getContentTypeFromURL,
  convertScalingToObjectFit,
  getDP1Margin,
} from '@/utils/helper';
import CursorLayer, { CursorLayerHandle } from '../CursorLayer';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { useArtworkSettings } from '@/services/custom-hooks/useArtworkSettings';

const MAX_RECOVERY_TIME = 60000 * 10;
const SLOT_INDICES = [0, 1] as const;

type SlotIndex = 0 | 1;

interface SlotLayer {
  previewURL: string;
  displayPreviewURL: string;
  displaySoftwareURL: string;
  previewType: PreviewHTMLTag | null;
  isStreaming: boolean;
  loading: boolean;
  iframeKey: number;
}

function createSlotLayer(previewURL: string, iframeKey: number): SlotLayer {
  return {
    previewURL,
    displayPreviewURL: '',
    displaySoftwareURL: '',
    previewType: null,
    isStreaming: false,
    loading: true,
    iframeKey,
  };
}

function isEmbeddedHeavy(t: PreviewHTMLTag | null): boolean {
  return t === PreviewHTMLTag.iframe || t === PreviewHTMLTag.object;
}

const ArtworkPlayer = ({
  previewURL,
  isCustomView,
  artworkPreviewMIMEType,
  displayPreferences,
}: {
  previewURL: string;
  isCustomView?: boolean;
  keyboardCode?: number;
  artworkPreviewMIMEType?: string;
  displayPreferences: DP1DisplayPreference;
}) => {
  const FADE_IN_OUT_DURATION_MS = 650;
  const { context } = useAppContext();
  const [slots, setSlots] = useState<[SlotLayer | null, SlotLayer | null]>([
    null,
    null,
  ]);
  const [slotOpacity, setSlotOpacity] = useState<[number, number]>([1, 0]);
  const [activeSlot, setActiveSlot] = useState<SlotIndex>(0);
  const [topSlotIndex, setTopSlotIndex] = useState<SlotIndex | null>(null);
  const [globalLoading, setGlobalLoading] = useState<boolean>(true);
  const [showLoading, setShowLoading] = useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [messageModalText, setMessageModalText] = useState<string | null>(null);
  const [messageModalTitle, setMessageModalTitle] = useState<string | null>(
    null
  );

  const iframeRefs = [
    useRef<HTMLIFrameElement>(null),
    useRef<HTMLIFrameElement>(null),
  ];

  const webGLRecoveryIntervalRef = useRef<NodeJS.Timeout>();
  const loadingDelayRef = useRef<NodeJS.Timeout>();
  const transitionTimeoutRef = useRef<NodeJS.Timeout>();
  const transitionTokenRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWebGLContextLost = useRef<boolean>(false);
  const iframeKeyCounterRef = useRef(0);

  const imageRefs = [
    useRef<HTMLImageElement | null>(null),
    useRef<HTMLImageElement | null>(null),
  ];
  const videoRefs = [
    useRef<HTMLVideoElement | null>(null),
    useRef<HTMLVideoElement | null>(null),
  ];
  const audioRefs = [
    useRef<HTMLAudioElement | null>(null),
    useRef<HTMLAudioElement | null>(null),
  ];

  const { displaySettings } = useArtworkSettings(displayPreferences);

  const mediaLoaders = useRef([createMediaLoader(), createMediaLoader()]);
  const hlsInstancesRef = useRef<[Hls | null, Hls | null]>([null, null]);
  const hlsLoadedURLRef = useRef<[string, string]>(['', '']);
  const playedVideoURLRef = useRef<[string, string]>(['', '']);
  const pendingReadySlotRef = useRef<SlotIndex | null>(null);
  const incomingSlotRef = useRef<SlotIndex | null>(null);
  const previewURLRef = useRef(previewURL);
  const slotsRef = useRef(slots);
  const activeSlotRef = useRef(activeSlot);
  const slotOpacityRef = useRef<[number, number]>(slotOpacity);

  const cursorRef = useRef<CursorLayerHandle>(null);

  function getPreviewTypeConfig(type: string): {
    previewType: PreviewHTMLTag;
    isStreaming: boolean;
  } {
    if (!type) {
      return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
    }

    type = type.toLowerCase();

    if (MIMETypeStreamVideo.includes(type)) {
      return { previewType: PreviewHTMLTag.video, isStreaming: true };
    }

    if (MITETypeIframe.includes(type)) {
      return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
    }

    if (type.match(MIMETypeSvg)) {
      // SVG files (especially with scripts) should use object tag.
      return { previewType: PreviewHTMLTag.object, isStreaming: false };
    }

    if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
      return { previewType: PreviewHTMLTag.object, isStreaming: false };
    }

    if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
      return { previewType: PreviewHTMLTag.video, isStreaming: false };
    }

    if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
      return { previewType: PreviewHTMLTag.audio, isStreaming: false };
    }

    if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
      return { previewType: PreviewHTMLTag.image, isStreaming: false };
    }

    if (FileUseIframePDF.includes(type) || type.match(MIMETypePdf)) {
      return { previewType: PreviewHTMLTag.iframePDF, isStreaming: false };
    }

    return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
  }

  useEffect(() => {
    previewURLRef.current = previewURL;
  }, [previewURL]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);
  useEffect(() => {
    slotOpacityRef.current = slotOpacity;
  }, [slotOpacity]);

  const pauseAndTeardownSlot = useCallback((slotIndex: SlotIndex) => {
    hlsInstancesRef.current[slotIndex]?.destroy();
    hlsInstancesRef.current[slotIndex] = null;
    hlsLoadedURLRef.current[slotIndex] = '';
    videoRefs[slotIndex].current?.pause();
    audioRefs[slotIndex].current?.pause();
    playedVideoURLRef.current[slotIndex] = '';
  }, []);

  const reTryToPlayVideo = (slotIndex: SlotIndex) => {
    const el = videoRefs[slotIndex].current;
    if (el) {
      el.muted = true;
      el.play().catch((error: unknown) => {
        console.log('[ArtworkPlayer] Error play video', JSON.stringify(error));
        Sentry.captureMessage('[ArtworkPlayer] Error play video');
      });
    }
  };

  const unmuteVideo = () => {
    const current = activeSlotRef.current;
    const layer = slotsRef.current[current];
    const video = videoRefs[current].current;
    if (layer?.previewType === PreviewHTMLTag.video && video) {
      video.muted = false;
      document.removeEventListener('click', unmuteVideo);
    }
  };

  // Update cursor positions when they change in context
  useEffect(() => {
    if (context.cursorPositions && context.cursorPositions.length > 0) {
      cursorRef.current?.setPositions(context.cursorPositions);
    }
  }, [context.cursorPositions]);

  const updateSlot = useCallback(
    (slotIndex: SlotIndex, patch: Partial<SlotLayer>) => {
      setSlots(prev => {
        const cur = prev[slotIndex];
        if (!cur) return prev;
        const next = [...prev] as [SlotLayer | null, SlotLayer | null];
        next[slotIndex] = { ...cur, ...patch };
        return next;
      });
    },
    []
  );

  const markSlotReady = useCallback(
    (slotIndex: SlotIndex) => {
      const currentURL = previewURLRef.current;
      pendingReadySlotRef.current = slotIndex;
      setSlots(prev => {
        const layer = prev[slotIndex];
        if (layer?.previewURL !== currentURL || !layer.loading) return prev;
        const next = [...prev] as [SlotLayer | null, SlotLayer | null];
        next[slotIndex] = { ...layer, loading: false };
        return next;
      });
    },
    [previewURLRef]
  );

  const loadedSource = useCallback(
    (slotIndex: SlotIndex) => {
      const currentURL = previewURLRef.current;
      const slot = slotsRef.current[slotIndex];
      if (slot?.previewURL !== currentURL) {
        return;
      }

      // If incomingSlotRef gets out-of-sync (e.g. playlist boundary / rapid source churn),
      // allow rebind only when the currently pointed slot no longer matches current URL.
      const currentIncoming = incomingSlotRef.current;
      if (currentIncoming !== null && currentIncoming !== slotIndex) {
        const incomingLayer = slotsRef.current[currentIncoming];
        if (incomingLayer?.previewURL === currentURL) {
          return;
        }
      }
      incomingSlotRef.current = slotIndex;
      markSlotReady(slotIndex);
    },
    [markSlotReady]
  );

  const playVideoForSlot = useCallback(
    (
      slotIndex: SlotIndex,
      layer: SlotLayer,
      videoElement: HTMLVideoElement
    ) => {
      const targetSlot = incomingSlotRef.current ?? activeSlotRef.current;
      if (
        playedVideoURLRef.current[slotIndex] === layer.previewURL ||
        targetSlot !== slotIndex
      ) {
        return;
      }

      playedVideoURLRef.current[slotIndex] = layer.previewURL;
      videoElement
        .play()
        .catch((error: unknown) => {
          console.log('Error play video', error);
          reTryToPlayVideo(slotIndex);
        })
        .finally(() => {
          loadedSource(slotIndex);
        });
    },
    [loadedSource]
  );

  const setupStreamingVideoForSlot = useCallback(
    (slotIndex: SlotIndex, layer: SlotLayer | null) => {
      const videoElement = videoRefs[slotIndex].current;
      if (
        !layer ||
        layer.previewType !== PreviewHTMLTag.video ||
        !videoElement
      ) {
        return undefined;
      }

      let hlsInstance: Hls | null = null;
      if (
        layer.isStreaming &&
        Hls.isSupported() &&
        layer.displayPreviewURL.endsWith('.m3u8')
      ) {
        hlsInstance = new Hls({
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferLength: 30,
          liveSyncDuration: 10,
        });
        hlsInstancesRef.current[slotIndex] = hlsInstance;
        hlsInstance.attachMedia(videoElement);
        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          const sourceURL = `${layer.displayPreviewURL}?clientBandwidthHint=${CLIENT_BANDWIDTH_HINT.toString()}`;
          if (hlsLoadedURLRef.current[slotIndex] !== sourceURL) {
            hlsLoadedURLRef.current[slotIndex] = sourceURL;
            hlsInstance?.loadSource(sourceURL);
          }
          playVideoForSlot(slotIndex, layer, videoElement);
        });
        hlsInstance.on(Hls.Events.ERROR, function (_event, data) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
                hlsInstance?.recoverMediaError();
              }
              break;
            default:
              hlsInstance?.destroy();
              hlsInstancesRef.current[slotIndex] = null;
              break;
          }
        });
      }

      return () => {
        hlsInstance?.destroy();
        if (hlsInstancesRef.current[slotIndex] === hlsInstance) {
          hlsInstancesRef.current[slotIndex] = null;
        }
        if (
          hlsLoadedURLRef.current[slotIndex].startsWith(layer.displayPreviewURL)
        ) {
          hlsLoadedURLRef.current[slotIndex] = '';
        }
      };
    },
    [playVideoForSlot]
  );

  useLayoutEffect(() => {
    const readySlot = pendingReadySlotRef.current;
    if (readySlot === null) return;

    const currentURL = previewURLRef.current;
    const incomingLayer = slots[readySlot];
    if (incomingLayer?.previewURL !== currentURL) {
      pendingReadySlotRef.current = null;
      return;
    }
    if (incomingLayer.loading) return;

    pendingReadySlotRef.current = null;
    setGlobalLoading(false);
    setShowLoading(false);
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = undefined;
    }

    iframeRefs[readySlot].current?.focus();

    const other = (readySlot === 0 ? 1 : 0) as SlotIndex;
    const otherLayer = slots[other];
    if (!otherLayer) {
      setSlotOpacity(readySlot === 0 ? [1, 0] : [0, 1]);
      setActiveSlot(readySlot);
      incomingSlotRef.current = null;
      setTopSlotIndex(null);
      return;
    }

    if (incomingSlotRef.current !== readySlot) {
      return;
    }

    const outgoing = activeSlotRef.current;
    const incoming = readySlot;
    if (outgoing === incoming) return;

    const outLayer = slots[outgoing];
    const outgoingType = outLayer?.previewType ?? null;
    const incomingType = incomingLayer.previewType;
    const sequential =
      isEmbeddedHeavy(outgoingType) || isEmbeddedHeavy(incomingType);

    transitionTokenRef.current += 1;
    const token = transitionTokenRef.current;
    if (transitionTimeoutRef.current)
      clearTimeout(transitionTimeoutRef.current);

    pauseAndTeardownSlot(outgoing);
    setTopSlotIndex(incoming);

    if (sequential) {
      setSlotOpacity(prev => {
        const op = [...prev] as [number, number];
        op[outgoing] = 0;
        op[incoming] = 0;
        return op;
      });
      transitionTimeoutRef.current = setTimeout(() => {
        if (token !== transitionTokenRef.current) return;
        setSlots(prev => {
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[outgoing] = null;
          return next;
        });
        setSlotOpacity(incoming === 0 ? [1, 0] : [0, 1]);
        setActiveSlot(incoming);
        incomingSlotRef.current = null;
        setTopSlotIndex(null);
      }, FADE_IN_OUT_DURATION_MS);
      return;
    }

    setSlotOpacity(prev => {
      const op = [...prev] as [number, number];
      op[outgoing] = 0;
      op[incoming] = 1;
      return op;
    });
    transitionTimeoutRef.current = setTimeout(() => {
      if (token !== transitionTokenRef.current) return;
      setSlots(prev => {
        const next = [...prev] as [SlotLayer | null, SlotLayer | null];
        next[outgoing] = null;
        return next;
      });
      setActiveSlot(incoming);
      incomingSlotRef.current = null;
      setTopSlotIndex(null);
    }, FADE_IN_OUT_DURATION_MS);
  }, [slots, pauseAndTeardownSlot]);

  const handleIframeLoad = (slotIndex: SlotIndex) => {
    if (isWebGLAvailable()) {
      setShowMessageModal(false);
      loadedSource(slotIndex);
    } else {
      handleWebGLLost();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const url = previewURL;
    if (!url) return;

    // Cancel any in-flight transition and collapse to a single active layer.
    // This prevents stale overlays from previous tokens blocking the next artwork.
    transitionTokenRef.current += 1;
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = undefined;
    }
    setTopSlotIndex(null);

    const currentActive = activeSlotRef.current;
    const staleSlot = (currentActive === 0 ? 1 : 0) as SlotIndex;
    pauseAndTeardownSlot(staleSlot);
    setSlotOpacity(currentActive === 0 ? [1, 0] : [0, 1]);
    setSlots(prev => {
      if (!prev[staleSlot]) return prev;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[staleSlot] = null;
      return next;
    });

    setGlobalLoading(true);
    setShowLoading(false);
    if (loadingDelayRef.current) clearTimeout(loadingDelayRef.current);
    loadingDelayRef.current = setTimeout(() => {
      if (!cancelled && previewURLRef.current === url) {
        setShowLoading(true);
      }
    }, 2000);

    setSlots(prev => {
      const hasAny = prev[currentActive] !== null;
      if (!hasAny) {
        const k = ++iframeKeyCounterRef.current;
        incomingSlotRef.current = currentActive;
        const next: [SlotLayer | null, SlotLayer | null] = [null, null];
        next[currentActive] = createSlotLayer(url, k);
        return next;
      }
      const incoming = (currentActive === 0 ? 1 : 0) as SlotIndex;
      incomingSlotRef.current = incoming;
      const k = ++iframeKeyCounterRef.current;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[incoming] = createSlotLayer(url, k);
      return next;
    });

    const detectPreviewType = async (): Promise<{
      previewType: PreviewHTMLTag;
      isStreaming: boolean;
    }> => {
      if (artworkPreviewMIMEType) {
        const cfg = getPreviewTypeConfig(artworkPreviewMIMEType);
        Sentry.addBreadcrumb({
          category: 'ArtworkPlayer',
          message: 'play artwork',
          data: { previewURL: url, artworkPreviewMIMEType },
        });
        return cfg;
      }
      const contentType = await getContentTypeFromURL(url);
      const cfg = getPreviewTypeConfig(contentType);
      Sentry.addBreadcrumb({
        category: 'ArtworkPlayer',
        message: 'play artwork',
        data: { previewURL: url, contentType },
      });
      return cfg;
    };

    detectPreviewType()
      .then(cfg => {
        if (cancelled || previewURLRef.current !== url) return;
        setSlots(prev => {
          const incoming = incomingSlotRef.current;
          if (incoming === null) return prev;
          const layer = prev[incoming];
          if (layer?.previewURL !== url) return prev;
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[incoming] = {
            ...layer,
            previewType: cfg.previewType,
            isStreaming: cfg.isStreaming,
            displayPreviewURL: url,
            displaySoftwareURL: url,
          };
          return next;
        });
      })
      .catch((error: unknown) => {
        if (cancelled || previewURLRef.current !== url) return;
        Sentry.captureException(error);
        setSlots(prev => {
          const incoming = incomingSlotRef.current;
          if (incoming === null) return prev;
          const layer = prev[incoming];
          if (layer?.previewURL !== url) return prev;
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[incoming] = {
            ...layer,
            previewType: PreviewHTMLTag.iframe,
            isStreaming: false,
            displayPreviewURL: url,
            displaySoftwareURL: url,
          };
          return next;
        });
      });

    return () => {
      cancelled = true;
      if (loadingDelayRef.current) clearTimeout(loadingDelayRef.current);
    };
  }, [previewURL, artworkPreviewMIMEType]);

  useEffect(() => {
    const layer = slots[activeSlot];
    if (
      layer?.previewType === PreviewHTMLTag.video &&
      videoRefs[activeSlot].current
    ) {
      document.addEventListener('click', unmuteVideo);
    }
    return () => {
      document.removeEventListener('click', unmuteVideo);
    };
  }, [slots, activeSlot]);

  /**
   * HLS / progressive video: one effect per slot.
   * If both slots share one effect with combined deps, any change to slot 1 re-runs the whole
   * effect → cleanup destroys BOTH Hls instances → both slots call loadSource again → flash.
   */
  useEffect(() => {
    return setupStreamingVideoForSlot(0, slots[0]);
  }, [
    slots[0]?.displayPreviewURL,
    slots[0]?.previewType,
    slots[0]?.isStreaming,
    setupStreamingVideoForSlot,
  ]);

  useEffect(() => {
    return setupStreamingVideoForSlot(1, slots[1]);
  }, [
    slots[1]?.displayPreviewURL,
    slots[1]?.previewType,
    slots[1]?.isStreaming,
    setupStreamingVideoForSlot,
  ]);

  /**
   * ----------------------------- START OF MEDIA SETUP --------------------------------
   * This effect is responsible for loading the media for the slots.
   * Load media for image, video (not streaming), and audio slots.
   */
  const setupMediaForSlot = useCallback(
    (slotIndex: SlotIndex, layer: SlotLayer | null) => {
      if (!layer?.displayPreviewURL) return undefined;

      let isCancelled = false;
      const abortController = new AbortController();
      const mediaCleanupFns: (() => void)[] = [];

      const handleMediaError =
        (mediaType: BlobLoadedMediaType) => (error: Error) => {
          console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
          Sentry.captureMessage(`[ArtworkPlayer] ${mediaType} load failed`, {
            level: 'error',
            extra: { displayPreviewURL: layer.displayPreviewURL, mediaType },
          });
        };

      const loadMedia = async () => {
        if (isCancelled) return;
        if (
          layer.previewType === PreviewHTMLTag.image &&
          imageRefs[slotIndex].current
        ) {
          const el = imageRefs[slotIndex].current;
          el.onload = () => {
            loadedSource(slotIndex);
          };
          el.onerror = () => {
            handleMediaError('image')(new Error('Image load failed'));
          };
          mediaCleanupFns.push(() => {
            el.onload = null;
            el.onerror = null;
          });
          await mediaLoaders.current[slotIndex].loadMedia({
            url: layer.displayPreviewURL,
            mediaType: 'image',
            element: el,
            onLoad: () => {
              loadedSource(slotIndex);
            },
            onError: handleMediaError('image'),
            signal: abortController.signal,
          });
        } else if (
          layer.previewType === PreviewHTMLTag.video &&
          !layer.isStreaming &&
          videoRefs[slotIndex].current
        ) {
          const el = videoRefs[slotIndex].current;
          const handleNonStreamingVideoReady = () => {
            playVideoForSlot(slotIndex, layer, el);
          };
          el.addEventListener('loadeddata', handleNonStreamingVideoReady);
          el.onerror = () => {
            handleMediaError('video')(new Error('Video load failed'));
          };
          mediaCleanupFns.push(() => {
            el.removeEventListener('loadeddata', handleNonStreamingVideoReady);
            el.onerror = null;
          });
          await mediaLoaders.current[slotIndex].loadMedia({
            url: layer.displayPreviewURL,
            mediaType: 'video',
            element: el,
            onLoad: () => {
              loadedSource(slotIndex);
            },
            onError: handleMediaError('video'),
            signal: abortController.signal,
          });
        } else if (
          layer.previewType === PreviewHTMLTag.audio &&
          audioRefs[slotIndex].current
        ) {
          const el = audioRefs[slotIndex].current;
          // createMediaLoader().loadMedia sets src only; it never invokes onLoad (see mediaLoader.ts).
          const handleAudioReady = () => {
            loadedSource(slotIndex);
          };
          el.addEventListener('loadeddata', handleAudioReady);
          el.onerror = () => {
            handleMediaError('audio')(new Error('Audio load failed'));
          };
          mediaCleanupFns.push(() => {
            el.removeEventListener('loadeddata', handleAudioReady);
            el.onerror = null;
          });
          await mediaLoaders.current[slotIndex].loadMedia({
            url: layer.displayPreviewURL,
            mediaType: 'audio',
            element: el,
            onLoad: () => {
              loadedSource(slotIndex);
            },
            onError: handleMediaError('audio'),
            signal: abortController.signal,
          });
        }
      };
      void loadMedia();

      return () => {
        isCancelled = true;
        abortController.abort();
        mediaCleanupFns.forEach(c => {
          c();
        });
        mediaLoaders.current[slotIndex].cleanup();
      };
    },
    [loadedSource, playVideoForSlot]
  );

  useEffect(() => {
    return setupMediaForSlot(0, slots[0]);
  }, [
    slots[0]?.displayPreviewURL,
    slots[0]?.previewType,
    slots[0]?.isStreaming,
    setupMediaForSlot,
  ]);

  useEffect(() => {
    return setupMediaForSlot(1, slots[1]);
  }, [
    slots[1]?.displayPreviewURL,
    slots[1]?.previewType,
    slots[1]?.isStreaming,
    setupMediaForSlot,
  ]);

  /** ----------------------------- END OF MEDIA SETUP ----------------------------------- */

  useEffect(() => {
    if (context.isOnline) {
      const activeNow = activeSlotRef.current;
      // During a transition, `topSlotIndex` points to the incoming slot we want to keep playing.
      // This prevents the `isOnline` effect from re-playing the outgoing slot while opacity state is mid-update.
      const targetSlot = topSlotIndex ?? activeNow;
      SLOT_INDICES.forEach(slotIndex => {
        const layer = slots[slotIndex];
        const video = videoRefs[slotIndex].current;
        const visible = slotOpacity[slotIndex] > 0.05;
        const shouldPlay =
          layer?.previewType === PreviewHTMLTag.video &&
          video &&
          visible &&
          slotIndex === targetSlot;
        if (shouldPlay) {
          if (video.paused) {
            video.play().catch((error: unknown) => {
              console.log(
                '[ArtworkPlayer] Error play video',
                JSON.stringify(error)
              );
              Sentry.captureMessage('[ArtworkPlayer] Error play video');
            });
          }
        } else {
          video?.pause();
        }
      });
    } else {
      videoRefs[0].current?.pause();
      videoRefs[1].current?.pause();
    }
  }, [context.isOnline, slots, slotOpacity, topSlotIndex]);

  useEffect(() => {
    if (!displaySettings || !context.deviceRotation?.viewMode) return;
    setSlots(prev => {
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      let changedCount = 0;
      SLOT_INDICES.forEach(i => {
        const slot = next[i];
        if (!slot?.displayPreviewURL) return;
        let softwareURL = slot.displayPreviewURL;
        if (
          slot.previewType === PreviewHTMLTag.iframe &&
          !slot.displayPreviewURL.includes('base64')
        ) {
          const displayMode =
            displaySettings.scaling === Scaling.Fill ? 'crop' : 'fit';
          const u = new URL(slot.displayPreviewURL);
          u.search += `&display_mode=${displayMode}`;
          softwareURL = u.toString();
        }
        if (softwareURL !== slot.displaySoftwareURL) {
          next[i] = { ...slot, displaySoftwareURL: softwareURL };
          changedCount += 1;
        }
      });
      if (changedCount === 0) return prev;
      return next;
    });
  }, [displaySettings, context.deviceRotation?.viewMode, slots]);

  const handleLoadIframeError = (slotIndex: SlotIndex) => {
    updateSlot(slotIndex, { loading: false });
    setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    setShowMessageModal(true);
  };

  const reloadIframe = (slotIndex: SlotIndex) => {
    setSlots(prev => {
      const slot = prev[slotIndex];
      if (!slot) return prev;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[slotIndex] = {
        ...slot,
        iframeKey: slot.iframeKey + 1,
        loading: true,
      };
      return next;
    });
  };

  const getCurrentCanvas = () => {
    canvasRef.current ??= document.createElement('canvas');
    return canvasRef.current;
  };

  const handleWebGLLost = () => {
    if (isWebGLContextLost.current) {
      return;
    }

    isWebGLContextLost.current = true;
    console.log('[ArtworkPlayer] WebGL context lost!');
    setMessageModalText(
      'This artwork appears to be especially demanding and may have caused a GPU crash. ' +
        'The system is now working to restore the display environment.<br/><br/>' +
        'This may take a moment. If the issue repeats, we recommend trying a different artwork ' +
        'or viewing this one on a higher-performance device.<br/><br/>' +
        'Thanks for your patience.'
    );
    setMessageModalTitle('Artwork Recovery in Progress');
    setShowMessageModal(true);
    setSlotOpacity([0, 0]);
    startWebGLRecovery();
  };

  const handleWebGLRestored = () => {
    console.log('[ArtworkPlayer] WebGL context restored!');
  };

  const startWebGLRecovery = () => {
    console.log('[ArtworkPlayer] startWebGLRecovery');
    if (webGLRecoveryIntervalRef.current) {
      clearInterval(webGLRecoveryIntervalRef.current);
    }

    const startTime = Date.now();
    webGLRecoveryIntervalRef.current = setInterval(() => {
      if (Date.now() - startTime > MAX_RECOVERY_TIME) {
        if (webGLRecoveryIntervalRef.current) {
          clearInterval(webGLRecoveryIntervalRef.current);
        }
        console.log('[ArtworkPlayer] WebGL recovery timed out');
        setMessageModalText(null);
        setMessageModalTitle(
          'Unfortunately, the system was unable to automatically recover the display environment.'
        );
        return;
      }

      if (isWebGLAvailable()) {
        if (webGLRecoveryIntervalRef.current) {
          clearInterval(webGLRecoveryIntervalRef.current);
        }

        isWebGLContextLost.current = false;
        setTimeout(() => {
          reloadIframe(activeSlotRef.current);
        }, 2000);
      }
    }, 5000);
  };

  // Assumes that GPU works normally if at least one of WebGL or WebGL2 is available
  const isWebGLAvailable = () => {
    try {
      const canvas = getCurrentCanvas();
      const glContext =
        canvas.getContext('webgl2', {
          antialias: true,
          failIfMajorPerformanceCaveat: true,
        }) ??
        canvas.getContext('webgl', {
          antialias: true,
          failIfMajorPerformanceCaveat: true,
        });

      if (glContext) {
        console.log(
          `[ArtworkPlayer] WebGL ${glContext instanceof WebGL2RenderingContext ? '2' : glContext instanceof WebGLRenderingContext ? '1' : 'null'} is available`
        );
        return true;
      }

      console.warn(`[ArtworkPlayer] Both WebGL and WebGL2 is not available`);

      return false;
    } catch (error) {
      console.error('[ArtworkPlayer] Error checking WebGL:', error);
      return false;
    }
  };

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      if (webGLRecoveryIntervalRef.current) {
        clearInterval(webGLRecoveryIntervalRef.current);
      }
      if (loadingDelayRef.current) {
        clearTimeout(loadingDelayRef.current);
        loadingDelayRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const webGLContextLostListener = (event: Event) => {
      console.log('[ArtworkPlayer] webGLContextLostListener');
      event.preventDefault();
      handleWebGLLost();
    };
    const canvas = getCurrentCanvas();
    canvas.addEventListener('webglcontextlost', webGLContextLostListener);
    canvas.addEventListener('webglcontextrestored', handleWebGLRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', webGLContextLostListener);
      canvas.removeEventListener('webglcontextrestored', handleWebGLRestored);
    };
  }, [previewURL]);

  const showSlowLoadingSpinner = () => {
    const incoming = incomingSlotRef.current;
    const layer = incoming === null ? null : slots[incoming];
    const t = layer?.previewType ?? null;
    return (
      showLoading &&
      globalLoading &&
      (t === null || t === PreviewHTMLTag.video || t === PreviewHTMLTag.audio)
    );
  };

  const renderSlot = (slotIndex: SlotIndex) => {
    const slot = slots[slotIndex];
    if (!slot?.displayPreviewURL || !slot.previewType) {
      return null;
    }

    const z =
      topSlotIndex === slotIndex ? 3 : slotOpacity[slotIndex] > 0 ? 2 : 0;

    return (
      <div
        key={`${slot.previewURL}-${String(slot.iframeKey)}`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          opacity: slotOpacity[slotIndex],
          transition: `opacity ${FADE_IN_OUT_DURATION_MS.toString()}ms ease`,
          zIndex: z,
          pointerEvents: slotOpacity[slotIndex] < 0.05 ? 'none' : 'auto',
        }}>
        {slot.previewType === PreviewHTMLTag.image && (
          <div
            style={{ width: '100%', height: '100%' }}
            className={isCustomView ? styles.customRendering : ''}>
            <img
              ref={imageRefs[slotIndex]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: convertScalingToObjectFit(displaySettings?.scaling),
              }}
              className={styles.image}
              alt="Preview"
            />
          </div>
        )}
        {slot.previewType === PreviewHTMLTag.object && (
          <object
            style={{ width: '100%', height: '100%' }}
            data={slot.displayPreviewURL}
            onLoad={() => {
              loadedSource(slotIndex);
            }}>
            Not supported
          </object>
        )}
        {slot.previewType === PreviewHTMLTag.video && (
          <video
            ref={videoRefs[slotIndex]}
            style={{
              width: '100%',
              height: '100%',
              objectFit: convertScalingToObjectFit(displaySettings?.scaling),
            }}
            autoPlay={false}
            loop={displaySettings?.loop ?? true}
            playsInline
            crossOrigin="anonymous"
          />
        )}
        {slot.previewType === PreviewHTMLTag.audio && (
          <audio
            ref={audioRefs[slotIndex]}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}
          />
        )}
        {slot.displaySoftwareURL &&
          slot.previewType === PreviewHTMLTag.iframe && (
            <iframe
              key={slot.iframeKey}
              ref={iframeRefs[slotIndex]}
              className={styles.iframe}
              src={slot.displaySoftwareURL}
              onLoad={() => {
                handleIframeLoad(slotIndex);
              }}
              onError={() => {
                handleLoadIframeError(slotIndex);
              }}
              sandbox="allow-same-origin allow-scripts"
              tabIndex={0}
            />
          )}
        {slot.displaySoftwareURL &&
          slot.previewType === PreviewHTMLTag.iframePDF && (
            <iframe
              className={styles.iframe}
              src={slot.displaySoftwareURL}
              onLoad={() => {
                handleIframeLoad(slotIndex);
              }}
              onError={() => {
                handleLoadIframeError(slotIndex);
              }}
              tabIndex={0}
            />
          )}
      </div>
    );
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          backgroundColor: displaySettings?.background ?? '#000000',
          justifyContent: 'center',
          position: 'relative',
          transition: 'padding 0.2s ease',
          padding: displaySettings?.margin
            ? getDP1Margin(displaySettings.margin)
            : '0px',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
        }}>
        <CursorLayer ref={cursorRef} />
        {showSlowLoadingSpinner() && <Loading />}
        {SLOT_INDICES.map(i => renderSlot(i))}
      </div>
      {showMessageModal && (
        <MessageModal
          screenRatio={1}
          message={messageModalText ?? ''}
          messageModalType={MessageModalType.info}
          title={messageModalTitle ?? ''}
        />
      )}
    </>
  );
};

export default ArtworkPlayer;
