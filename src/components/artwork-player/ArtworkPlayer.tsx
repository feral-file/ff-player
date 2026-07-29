/* eslint-disable max-lines, max-lines-per-function, react-hooks/exhaustive-deps --
 * ArtworkPlayer remains the mixed-media playback surface; a full split is deferred.
 * Prefer new logic in hooks/utils alongside this file rather than growing inline debt here.
 */
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
import { canvasService } from '@/services/CanvasService';
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
import {
  RenderStatus,
} from '@/models';
import { useArtworkSettings } from '@/services/custom-hooks/useArtworkSettings';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import ModelViewerScreen from '../model-viewer/ModelViewerScreen';

const MAX_RECOVERY_TIME = 60000 * 10;
const RENDER_LOADING_DELAY_MS = 2000;
const SLOT_INDICES = [0, 1] as const;

type SlotIndex = 0 | 1;

interface SlotLayer {
  previewURL: string;
  displayPreviewURL: string;
  displaySoftwareURL: string;
  mimeType: string | null;
  previewType: PreviewHTMLTag | null;
  isStreaming: boolean;
  loading: boolean;
  iframeKey: number;
  // Stable identity of the playlist item this slot is rendering. Adjacent
  // playlist items can share the same URL (and the same SlotLayer reuses
  // them); itemIdentity discriminates so the onEnded gate can reject events
  // from the previous item even when previewURL alone cannot.
  itemIdentity: string;
}

function createSlotLayer(
  previewURL: string,
  iframeKey: number,
  itemIdentity: string
): SlotLayer {
  return {
    previewURL,
    displayPreviewURL: '',
    displaySoftwareURL: '',
    mimeType: null,
    previewType: null,
    isStreaming: false,
    loading: true,
    iframeKey,
    itemIdentity,
  };
}

function isEmbeddedHeavy(t: PreviewHTMLTag | null): boolean {
  return (
    t === PreviewHTMLTag.iframe ||
    t === PreviewHTMLTag.object ||
    t === PreviewHTMLTag.model
  );
}

function isModelMimeType(type: string): boolean {
  const mediaType = type.split(';')[0].trim().toLowerCase();
  return mediaType === 'model/gltf-binary' || mediaType === 'model/gltf+json';
}

const ArtworkPlayer = ({
  previewURL,
  isCustomView,
  artworkPreviewMIMEType,
  displayPreferences,
  itemIdentity,
  onRegisterArtworkReload,
  onSourceEnded,
  onItemCommitted,
}: {
  previewURL: string;
  isCustomView?: boolean;
  keyboardCode?: number;
  artworkPreviewMIMEType?: string;
  displayPreferences: DP1DisplayPreference;
  // Stable identity of the current playlist item. When adjacent items share
  // the same URL, this discriminates them so the player can (a) restart
  // playback on transition and (b) reject `ended` events from the previous
  // item once the next one has become current.
  itemIdentity?: string;
  onRegisterArtworkReload?: (reload: (() => void) | null) => void;
  // Fired when a time-based source (video/audio) reaches end-of-stream.
  // The HTML5 media element only emits `ended` when its `loop` attribute is
  // false, so this callback is naturally gated by display.loop. Per DP-1
  // §4.1, the consumer (PlaylistClient) advances to the next item.
  // The argument is the firing slot's itemIdentity so the consumer can
  // drop events that arrive after the playlist has already moved past them.
  onSourceEnded?: (itemIdentity: string) => void;
  // Fired when an incoming slot actually becomes the visible artwork — at
  // first paint of an initial slot, at crossfade start, or at the sequential
  // handoff's fade-in. Selection state (currentIndex) moves ahead of this on
  // slow loads because the outgoing artwork deliberately stays on screen
  // until incoming media is ready; consumers that describe "what is on the
  // wall" (the tombstone label, feral-file#3452) must key off this commit,
  // never off selection.
  onItemCommitted?: (itemIdentity: string) => void;
}) => {
  const FADE_IN_OUT_DURATION_MS = 650;
  const { context } = useAppContext();
  const [artworkReloadTick, setArtworkReloadTick] = useState(0);
  const performArtworkReload = useCallback(() => {
    setArtworkReloadTick(n => n + 1);
  }, []);
  useLayoutEffect(() => {
    if (!onRegisterArtworkReload) {
      return;
    }
    onRegisterArtworkReload(performArtworkReload);
    return () => {
      onRegisterArtworkReload(null);
    };
  }, [onRegisterArtworkReload, performArtworkReload]);
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
  const renderStatusRef = useRef<RenderStatus | undefined>(undefined);
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
  const showRenderLoadingOverlay =
    context.appRemoteConfig.showRenderLoadingOverlay ?? true;

  const mediaLoaders = useRef([createMediaLoader(), createMediaLoader()]);
  const hlsInstancesRef = useRef<[Hls | null, Hls | null]>([null, null]);
  const hlsLoadedURLRef = useRef<[string, string]>(['', '']);
  const playedVideoURLRef = useRef<[string, string]>(['', '']);
  const pendingReadySlotRef = useRef<SlotIndex | null>(null);
  const incomingSlotRef = useRef<SlotIndex | null>(null);
  const previewURLRef = useRef(previewURL);
  const itemIdentityRef = useRef(itemIdentity ?? '');
  const slotsRef = useRef(slots);
  const activeSlotRef = useRef(activeSlot);
  const slotOpacityRef = useRef<[number, number]>(slotOpacity);

  const cursorRef = useRef<CursorLayerHandle>(null);

  // Latch visual settings until the incoming artwork is actually committed,
  // so an outgoing slot never redraws using the next item's appearance.
  const [committedVisualSettings, setCommittedVisualSettings] =
    useState(displaySettings);
  const displaySettingsRef = useRef(displaySettings);
  useLayoutEffect(() => {
    displaySettingsRef.current = displaySettings;
  }, [displaySettings]);
  const commitVisualSettings = useCallback(() => {
    setCommittedVisualSettings(displaySettingsRef.current);
  }, []);
  useEffect(() => {
    const activeLayer = slotsRef.current[activeSlotRef.current];
    const transitionPending =
      incomingSlotRef.current !== null ||
      (activeLayer !== null && activeLayer.previewURL !== previewURLRef.current);
    if (!transitionPending) {
      setCommittedVisualSettings(displaySettings);
    }
  }, [displaySettings]);

  const clearLoadingDelay = useCallback(() => {
    if (!loadingDelayRef.current) {
      return;
    }
    clearTimeout(loadingDelayRef.current);
    loadingDelayRef.current = undefined;
  }, []);

  const markArtworkPending = useCallback(() => {
    if (renderStatusRef.current === RenderStatus.pending) {
      return;
    }
    renderStatusRef.current = RenderStatus.pending;
    canvasService.setRenderStatus(RenderStatus.pending);
    setGlobalLoading(true);
    setShowLoading(false);
    setShowMessageModal(false);
    setMessageModalText(null);
    setMessageModalTitle(null);
  }, []);

  const markArtworkLoading = useCallback(() => {
    if (renderStatusRef.current === RenderStatus.loading) {
      return;
    }
    renderStatusRef.current = RenderStatus.loading;
    canvasService.setRenderStatus(RenderStatus.loading);
    setGlobalLoading(true);
    setShowLoading(true);
  }, []);

  const markArtworkReady = useCallback(() => {
    if (renderStatusRef.current === RenderStatus.ready) {
      return;
    }
    // Model-viewer failures commit the slot via loadedSource then mark failed.
    // Transition completion must not overwrite that failed status with ready.
    if (renderStatusRef.current === RenderStatus.failed) {
      return;
    }
    renderStatusRef.current = RenderStatus.ready;
    canvasService.setRenderStatus(RenderStatus.ready);
    setGlobalLoading(false);
    setShowLoading(false);
    clearLoadingDelay();
    setShowMessageModal(false);
    setMessageModalText(null);
    setMessageModalTitle(null);
  }, [clearLoadingDelay]);

  const markArtworkFailed = useCallback(() => {
    if (renderStatusRef.current === RenderStatus.failed) {
      return;
    }
    renderStatusRef.current = RenderStatus.failed;
    canvasService.setRenderStatus(RenderStatus.failed);
    setGlobalLoading(false);
    setShowLoading(false);
    clearLoadingDelay();
  }, [clearLoadingDelay]);

  const isCurrentArtworkSlot = useCallback(
    (slotIndex: SlotIndex, expectedLayer?: SlotLayer) => {
      const currentURL = previewURLRef.current;
      const slot = slotsRef.current[slotIndex];
      if (!slot) {
        return false;
      }
      if (
        expectedLayer &&
        (slot.previewURL !== expectedLayer.previewURL ||
          slot.itemIdentity !== expectedLayer.itemIdentity ||
          slot.iframeKey !== expectedLayer.iframeKey)
      ) {
        return false;
      }
      if (slot.previewURL !== currentURL) {
        return false;
      }
      if (slot.itemIdentity !== itemIdentityRef.current) {
        return false;
      }

      const currentIncoming = incomingSlotRef.current;
      if (currentIncoming !== null && currentIncoming !== slotIndex) {
        const incomingLayer = slotsRef.current[currentIncoming];
        if (
          incomingLayer?.previewURL === currentURL &&
          incomingLayer.itemIdentity === itemIdentityRef.current
        ) {
          return false;
        }
      }

      return true;
    },
    []
  );

  useEffect(() => {
    return () => {
      canvasService.setRenderStatus(undefined);
      renderStatusRef.current = undefined;
    };
  }, []);

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

    if (isModelMimeType(type)) {
      // GLB / glTF files need the model-viewer surface so the browser renders
      // the asset instead of treating it as a raw binary/object payload.
      // Keep them on the heavy embedded path so the transition waits for the
      // WebGL surface to report readiness.
      return { previewType: PreviewHTMLTag.model, isStreaming: false };
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

  // These refs feed the end-of-stream gate. useLayoutEffect runs
  // synchronously after a committed render and before the browser paints,
  // which is the right phase for "ref should reflect the committed prop":
  // it closes the post-passive-effect timing hole that drops valid `ended`
  // events without making the refs visible during interrupted/replayed
  // renders the way render-time assignment would under concurrent React.
  useLayoutEffect(() => {
    previewURLRef.current = previewURL;
  }, [previewURL]);
  useLayoutEffect(() => {
    itemIdentityRef.current = itemIdentity ?? '';
  }, [itemIdentity]);
  useLayoutEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useLayoutEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);
  useLayoutEffect(() => {
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

  // Fade-start half of teardown: silence the outgoing slot WITHOUT the
  // synchronous `Hls.destroy()` cost. This runs inside the layout effect
  // that kicks off the fade — before the browser paints the first fade
  // frame — so heavy work here janks the fade's opening frames (destroy
  // detaches MediaSource and frees up to 60MB of buffers, and detaching
  // can also blank the outgoing frame instead of freezing it). stopLoad()
  // still cuts network use immediately; the full destroy runs after the
  // fade, via `setupStreamingVideoForSlot`'s effect cleanup, when the
  // post-fade timeout removes the outgoing slot layer.
  //
  // Option A visual safety is preserved: the pause here, the visible-slot
  // gating in the isOnline effect, and playVideoForSlot's target-slot guard
  // are what keep the hidden outgoing video from resuming — destroy timing
  // was never load-bearing for that.
  const pauseSlotPlayback = useCallback((slotIndex: SlotIndex) => {
    hlsInstancesRef.current[slotIndex]?.stopLoad();
    videoRefs[slotIndex].current?.pause();
    audioRefs[slotIndex].current?.pause();
    playedVideoURLRef.current[slotIndex] = '';
  }, []);

  const reTryToPlayVideo = (slotIndex: SlotIndex) => {
    const el = videoRefs[slotIndex].current;
    if (el) {
      el.muted = true;
      const playPromise = el.play() as Promise<void> | undefined;
      void playPromise?.catch((error: unknown) => {
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
        if (!cur) {return prev;}
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
        if (layer?.previewURL !== currentURL || !layer.loading) {return prev;}
        const next = [...prev] as [SlotLayer | null, SlotLayer | null];
        next[slotIndex] = { ...layer, loading: false };
        return next;
      });
    },
    [previewURLRef]
  );

  const loadedSource = useCallback(
    (slotIndex: SlotIndex, expectedLayer?: SlotLayer): boolean => {
      if (!isCurrentArtworkSlot(slotIndex, expectedLayer)) {
        return false;
      }

      // If incomingSlotRef gets out-of-sync (e.g. playlist boundary / rapid source churn),
      // allow rebind only when the currently pointed slot no longer matches current URL.
      const currentIncoming = incomingSlotRef.current;
      if (currentIncoming !== null && currentIncoming !== slotIndex) {
        const incomingLayer = slotsRef.current[currentIncoming];
        if (incomingLayer?.previewURL === previewURLRef.current) {
          return false;
        }
      }

      incomingSlotRef.current = slotIndex;
      markSlotReady(slotIndex);
      return true;
    },
    [isCurrentArtworkSlot, markSlotReady]
  );

  const handleArtworkRenderFailure = useCallback(
    (slotIndex?: SlotIndex, expectedLayer?: SlotLayer) => {
      if (
        slotIndex !== undefined &&
        !isCurrentArtworkSlot(slotIndex, expectedLayer)
      ) {
        return;
      }
      if (slotIndex !== undefined) {
        // Treat a current failure as terminal readiness for transition
        // purposes, so the failed incoming slot replaces the outgoing one.
        loadedSource(slotIndex, expectedLayer);
        updateSlot(slotIndex, { loading: false });
      }
      if (renderStatusRef.current === RenderStatus.failed) {
        return;
      }
      markArtworkFailed();
      setMessageModalText(null);
      setMessageModalTitle(
        'The artwork cannot be displayed correctly on this device.'
      );
      setShowMessageModal(true);
    },
    [isCurrentArtworkSlot, loadedSource, markArtworkFailed, updateSlot]
  );

  const playVideoForSlot = useCallback(
    (
      slotIndex: SlotIndex,
      layer: SlotLayer,
      videoElement: HTMLVideoElement
    ) => {
      const targetSlot = incomingSlotRef.current ?? activeSlotRef.current;
      if (
        !isCurrentArtworkSlot(slotIndex, layer) ||
        playedVideoURLRef.current[slotIndex] === layer.previewURL ||
        targetSlot !== slotIndex
      ) {
        return;
      }

      playedVideoURLRef.current[slotIndex] = layer.previewURL;
      const playPromise = videoElement.play() as Promise<void> | undefined;
      if (!playPromise) {
        loadedSource(slotIndex, layer);
        return;
      }

      void playPromise
        .catch((error: unknown) => {
          console.log('Error play video', error);
          reTryToPlayVideo(slotIndex);
        })
        .finally(() => {
          loadedSource(slotIndex, layer);
        });
    },
    [isCurrentArtworkSlot, loadedSource]
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
          if (!isCurrentArtworkSlot(slotIndex, layer)) {
            return;
          }
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
              if (data.fatal) {
                handleArtworkRenderFailure(slotIndex, layer);
                hlsInstance?.destroy();
                if (hlsInstancesRef.current[slotIndex] === hlsInstance) {
                  hlsInstancesRef.current[slotIndex] = null;
                }
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
                if (isCurrentArtworkSlot(slotIndex, layer)) {
                  hlsInstance?.recoverMediaError();
                }
                break;
              }
              if (data.fatal) {
                handleArtworkRenderFailure(slotIndex, layer);
                hlsInstance?.destroy();
                if (hlsInstancesRef.current[slotIndex] === hlsInstance) {
                  hlsInstancesRef.current[slotIndex] = null;
                }
              }
              break;
            default:
              handleArtworkRenderFailure(slotIndex, layer);
              hlsInstance?.destroy();
              if (hlsInstancesRef.current[slotIndex] === hlsInstance) {
                hlsInstancesRef.current[slotIndex] = null;
              }
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
    [handleArtworkRenderFailure, isCurrentArtworkSlot, playVideoForSlot]
  );

  useLayoutEffect(() => {
    const readySlot = pendingReadySlotRef.current;
    if (readySlot === null) {return;}

    const currentURL = previewURLRef.current;
    const incomingLayer = slots[readySlot];
    if (incomingLayer?.previewURL !== currentURL) {
      pendingReadySlotRef.current = null;
      return;
    }
    if (incomingLayer.loading) {return;}

    pendingReadySlotRef.current = null;
    iframeRefs[readySlot].current?.focus();

    const other = (readySlot === 0 ? 1 : 0) as SlotIndex;
    const otherLayer = slots[other];
    if (!otherLayer) {
      commitVisualSettings();
      setSlotOpacity(readySlot === 0 ? [1, 0] : [0, 1]);
      setActiveSlot(readySlot);
      incomingSlotRef.current = null;
      setTopSlotIndex(null);
      markArtworkReady();
      onItemCommitted?.(incomingLayer.itemIdentity);
      return;
    }

    if (incomingSlotRef.current !== readySlot) {
      return;
    }

    const outgoing = activeSlotRef.current;
    const incoming = readySlot;
    if (outgoing === incoming) {return;}

    const outLayer = slots[outgoing];
    const outgoingType = outLayer?.previewType ?? null;
    const incomingType = incomingLayer.previewType;
    const sequential =
      isEmbeddedHeavy(outgoingType) || isEmbeddedHeavy(incomingType);

    transitionTokenRef.current += 1;
    const token = transitionTokenRef.current;
    if (transitionTimeoutRef.current)
      {clearTimeout(transitionTimeoutRef.current);}

    // Pause-only here (not pauseAndTeardownSlot): the sync Hls.destroy()
    // used to run in this pre-paint phase and jank the fade's first frames.
    // Destroy now happens via the streaming effect cleanup when the timeout
    // below removes the outgoing slot layer.
    pauseSlotPlayback(outgoing);
    setTopSlotIndex(incoming);

    if (sequential) {
      setSlotOpacity(prev => {
        const op = [...prev] as [number, number];
        op[outgoing] = 0;
        op[incoming] = 0;
        return op;
      });
      transitionTimeoutRef.current = setTimeout(() => {
        if (token !== transitionTokenRef.current) {return;}
        setSlots(prev => {
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[outgoing] = null;
          return next;
        });
        // Commit at the midpoint: the outgoing artwork is fully faded out,
        // so the incoming item's background/margin/scaling take over just
        // as its artwork fades in.
        commitVisualSettings();
        setSlotOpacity(incoming === 0 ? [1, 0] : [0, 1]);
        setActiveSlot(incoming);
        incomingSlotRef.current = null;
        setTopSlotIndex(null);
        markArtworkReady();
        onItemCommitted?.(incomingLayer.itemIdentity);
      }, FADE_IN_OUT_DURATION_MS);
      return;
    }

    setSlotOpacity(prev => {
      const op = [...prev] as [number, number];
      op[outgoing] = 0;
      op[incoming] = 1;
      return op;
    });
    // Crossfade start: the incoming work begins appearing now, so this is
    // the viewer-truth commit even though slot bookkeeping settles at fade
    // end in the timeout below.
    onItemCommitted?.(incomingLayer.itemIdentity);
    transitionTimeoutRef.current = setTimeout(() => {
      if (token !== transitionTokenRef.current) {return;}
      setSlots(prev => {
        const next = [...prev] as [SlotLayer | null, SlotLayer | null];
        next[outgoing] = null;
        return next;
      });
      // Commit at crossfade end: the outgoing artwork is gone, so the
      // stage swap is only visible in letterbox/margin areas (softened by
      // the container's background-color transition).
      commitVisualSettings();
      setActiveSlot(incoming);
      incomingSlotRef.current = null;
      setTopSlotIndex(null);
      markArtworkReady();
    }, FADE_IN_OUT_DURATION_MS);
  }, [
    commitVisualSettings,
    markArtworkReady,
    onItemCommitted,
    pauseAndTeardownSlot,
    slots,
  ]);

  const handleIframeLoad = (slotIndex: SlotIndex, layer: SlotLayer) => {
    if (isWebGLAvailable()) {
      setShowMessageModal(false);
      loadedSource(slotIndex, layer);
    } else {
      handleWebGLLost();
    }
  };

  const handleModelLoad = (slotIndex: SlotIndex, layer?: SlotLayer) => {
    if (loadedSource(slotIndex, layer)) {
      setShowMessageModal(false);
    }
  };

  const clearLoadingIndicators = useCallback(() => {
    setGlobalLoading(false);
    setShowLoading(false);
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = undefined;
    }
  }, []);

  /**
   * Keep model-viewer failures inside the transition pipeline so the failed
   * incoming slot becomes the committed artwork state instead of leaving the
   * previous slot visible underneath the error modal.
   * Also publish RenderStatus.failed so status polls match the error UI.
   */
  const handleModelLoadError = (slotIndex: SlotIndex, layer?: SlotLayer) => {
    if (!loadedSource(slotIndex, layer)) {
      return;
    }

    clearLoadingIndicators();
    markArtworkFailed();
    setMessageModalText(null);
    setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    setShowMessageModal(true);
  };

  useEffect(() => {
    let cancelled = false;
    const url = previewURL;
    if (!url) {return;}

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
      if (!prev[staleSlot]) {return prev;}
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[staleSlot] = null;
      return next;
    });

    markArtworkPending();
    clearLoadingDelay();
    loadingDelayRef.current = setTimeout(() => {
      if (
        !cancelled &&
        previewURLRef.current === url &&
        renderStatusRef.current === RenderStatus.pending
      ) {
        markArtworkLoading();
      }
    }, RENDER_LOADING_DELAY_MS);

    const identity = itemIdentityRef.current;
    setSlots(prev => {
      const hasAny = prev[currentActive] !== null;
      if (!hasAny) {
        const k = ++iframeKeyCounterRef.current;
        incomingSlotRef.current = currentActive;
        const next: [SlotLayer | null, SlotLayer | null] = [null, null];
        next[currentActive] = createSlotLayer(url, k, identity);
        return next;
      }
      const incoming = (currentActive === 0 ? 1 : 0) as SlotIndex;
      incomingSlotRef.current = incoming;
      const k = ++iframeKeyCounterRef.current;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[incoming] = createSlotLayer(url, k, identity);
      return next;
    });

    let resolvedMimeType = artworkPreviewMIMEType?.toLowerCase() ?? '';
    const detectPreviewType = async (): Promise<{
      previewType: PreviewHTMLTag;
      isStreaming: boolean;
    }> => {
      if (artworkPreviewMIMEType) {
        resolvedMimeType = artworkPreviewMIMEType.toLowerCase();
        const cfg = getPreviewTypeConfig(artworkPreviewMIMEType);
        Sentry.addBreadcrumb({
          category: 'ArtworkPlayer',
          message: 'play artwork',
          data: { previewURL: url, artworkPreviewMIMEType },
        });
        return cfg;
      }
      const contentType = await getContentTypeFromURL(url);
      resolvedMimeType = contentType.toLowerCase();
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
        if (cancelled || previewURLRef.current !== url) {return;}
        const incoming = incomingSlotRef.current;
        setSlots(prev => {
          if (incoming === null) {return prev;}
          const layer = prev[incoming];
          if (layer?.previewURL !== url) {return prev;}
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[incoming] = {
            ...layer,
            previewType: cfg.previewType,
            isStreaming: cfg.isStreaming,
            displayPreviewURL: url,
            displaySoftwareURL: url,
            mimeType: resolvedMimeType,
          };
          return next;
        });
      })
      .catch((error: unknown) => {
        if (cancelled || previewURLRef.current !== url) {return;}
        Sentry.captureException(error);
        setSlots(prev => {
          const incoming = incomingSlotRef.current;
          if (incoming === null) {return prev;}
          const layer = prev[incoming];
          if (layer?.previewURL !== url) {return prev;}
          const next = [...prev] as [SlotLayer | null, SlotLayer | null];
          next[incoming] = {
            ...layer,
            previewType: PreviewHTMLTag.iframe,
            isStreaming: false,
            displayPreviewURL: url,
            displaySoftwareURL: url,
            mimeType: null,
          };
          return next;
        });
      });

    return () => {
      cancelled = true;
      if (loadingDelayRef.current) {clearTimeout(loadingDelayRef.current);}
    };
    // itemIdentity is in the deps so adjacent playlist items that share the
    // same previewURL still trigger a fresh slot setup. Without this, the
    // effect would short-circuit on equal previewURL and the second item
    // would inherit the prior item's paused-at-end media frame.
  }, [previewURL, artworkPreviewMIMEType, artworkReloadTick, itemIdentity]);

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
      if (!layer?.displayPreviewURL) {return undefined;}

      let isCancelled = false;
      const abortController = new AbortController();
      const mediaCleanupFns: (() => void)[] = [];

      const handleMediaError =
        (mediaType: BlobLoadedMediaType) => (error: Error) => {
          if (!isCurrentArtworkSlot(slotIndex, layer)) {
            return;
          }
          console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
          // A failed incoming layer must still resolve its transition claim;
          // otherwise visual settings remain latched to the outgoing artwork.
          loadedSource(slotIndex, layer);
          handleArtworkRenderFailure(slotIndex, layer);
          Sentry.captureMessage(`[ArtworkPlayer] ${mediaType} load failed`, {
            level: 'error',
            extra: { displayPreviewURL: layer.displayPreviewURL, mediaType },
          });
        };

      const loadMedia = async () => {
        if (isCancelled) {return;}
        if (
          layer.previewType === PreviewHTMLTag.image &&
          imageRefs[slotIndex].current
        ) {
          const el = imageRefs[slotIndex].current;
          const markImageReady = () => {
            let decoded: Promise<unknown>;
            try {
              decoded =
                typeof el.decode === 'function' ? el.decode() : Promise.resolve();
            } catch {
              decoded = Promise.resolve();
            }
            void decoded.catch(() => undefined).finally(() => {
              if (!isCancelled) {
                loadedSource(slotIndex, layer);
              }
            });
          };
          el.onload = markImageReady;
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
            onLoad: markImageReady,
            onError: handleMediaError('image'),
            signal: abortController.signal,
          });
          if (el.complete && el.naturalWidth > 0) {
            loadedSource(slotIndex, layer);
          }
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
              loadedSource(slotIndex, layer);
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
            loadedSource(slotIndex, layer);
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
              loadedSource(slotIndex, layer);
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
    [
      handleArtworkRenderFailure,
      clearLoadingDelay,
      isCurrentArtworkSlot,
      loadedSource,
      playVideoForSlot,
      markArtworkLoading,
      markArtworkPending,
    ]
  );

  useEffect(() => {
    return setupMediaForSlot(0, slots[0]);
  }, [
    slots[0]?.displayPreviewURL,
    slots[0]?.previewType,
    slots[0]?.isStreaming,
    slots[0]?.itemIdentity,
    setupMediaForSlot,
  ]);

  useEffect(() => {
    return setupMediaForSlot(1, slots[1]);
  }, [
    slots[1]?.displayPreviewURL,
    slots[1]?.previewType,
    slots[1]?.isStreaming,
    slots[1]?.itemIdentity,
    setupMediaForSlot,
  ]);

  /** ----------------------------- END OF MEDIA SETUP ----------------------------------- */

  useEffect(() => {
    const activeNow = activeSlotRef.current;
    // During a transition, `topSlotIndex` points to the incoming slot we want to keep playing.
    // This prevents the `isOnline` effect from re-playing the outgoing slot while opacity state is mid-update.
    const targetSlot = topSlotIndex ?? activeNow;
    SLOT_INDICES.forEach(slotIndex => {
      const layer = slots[slotIndex];
      const video = videoRefs[slotIndex].current;
      const visible = slotOpacity[slotIndex] > 0.05;
      const isVideoLayer = layer?.previewType === PreviewHTMLTag.video;
      // HLS/live streaming (`isStreaming`) fetches new segments continuously
      // and stalls without a connection, so it must pause when offline.
      // Progressive/local video (`isStreaming: false`) has no such
      // dependency once its bytes are buffered — this includes offline-cache
      // replay traffic that `feral-controld` serves locally via CDP Fetch
      // interception or its local static blob server. Gating that on
      // `isOnline` made every cached video freeze like a still image during
      // real offline playback even though the bytes were already on disk.
      // Non-streaming video failures are already surfaced through the
      // element's own `onerror` -> `handleMediaError('video')` path, so we
      // don't need a connectivity-based pre-emptive pause for it here.
      const blockedByConnectivity = Boolean(layer?.isStreaming) && !context.isOnline;
      const shouldPlay =
        isVideoLayer &&
        video &&
        visible &&
        slotIndex === targetSlot &&
        !blockedByConnectivity;
      if (shouldPlay) {
        if (video.paused) {
          const playPromise = video.play() as Promise<void> | undefined;
          void playPromise?.catch((error: unknown) => {
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
  }, [context.isOnline, slots, slotOpacity, topSlotIndex]);

  useEffect(() => {
    if (!displaySettings || !context.deviceRotation?.viewMode) {return;}
    setSlots(prev => {
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      let changedCount = 0;
      SLOT_INDICES.forEach(i => {
        const slot = next[i];
        if (!slot?.displayPreviewURL) {return;}
        let softwareURL = slot.displayPreviewURL;
        if (
          slot.previewType === PreviewHTMLTag.iframe &&
          !isModelMimeType(slot.mimeType ?? '') &&
          !slot.displayPreviewURL.includes('base64')
        ) {
          // Per-slot settings: only the slot claimed as the incoming
          // transition target takes the live (next item's) scaling; any
          // other slot is on-screen artwork and must keep its committed
          // scaling — otherwise its softwareURL changes at playlist-advance
          // time and the iframe reloads (blanks) seconds before the
          // transition swaps it out. Keyed off incomingSlotRef (not a
          // previewURL comparison) because adjacent playlist items can
          // share the same URL while differing in scaling.
          const slotSettings =
            incomingSlotRef.current === i
              ? displaySettings
              : (committedVisualSettings ?? displaySettings);
          const displayMode =
            slotSettings.scaling === Scaling.Fill ? 'crop' : 'fit';
          const u = new URL(slot.displayPreviewURL, window.location.href);
          u.search += `&display_mode=${displayMode}`;
          softwareURL = u.toString();
        }
        if (softwareURL !== slot.displaySoftwareURL) {
          next[i] = { ...slot, displaySoftwareURL: softwareURL };
          changedCount += 1;
        }
      });
      if (changedCount === 0) {return prev;}
      return next;
    });
  }, [
    displaySettings,
    committedVisualSettings,
    context.deviceRotation?.viewMode,
    slots,
  ]);

  const handleLoadIframeError = (slotIndex: SlotIndex, layer: SlotLayer) => {
    // Failure still consumes the current incoming slot. Without this, an
    // iframe/object error leaves the transition claim active and permanently
    // holds visual settings on the outgoing artwork.
    if (!loadedSource(slotIndex, layer)) {
      return;
    }
    handleArtworkRenderFailure(slotIndex, layer);
  };

  const reloadIframe = (slotIndex: SlotIndex) => {
    setSlots(prev => {
      const slot = prev[slotIndex];
      if (!slot) {return prev;}
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
    markArtworkFailed();
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
          // handleWebGLLost publishes failed; markArtworkReady intentionally
          // ignores failed→ready (model-viewer commit). Clear failed before
          // the recovery reload so a successful iframe ready can publish ready.
          markArtworkPending();
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
    // ModelViewerScreen owns its own "Loading 3D model" overlay; stacking the
    // global ArtworkPlayer spinner on top creates a dual-overlay flash. Check
    // incoming as well so image→model transitions do not briefly stack both.
    const activePreviewType = slots[activeSlot]?.previewType;
    const incoming = incomingSlotRef.current;
    const incomingPreviewType =
      incoming !== null ? slots[incoming]?.previewType : undefined;
    if (
      activePreviewType === PreviewHTMLTag.model ||
      incomingPreviewType === PreviewHTMLTag.model
    ) {
      return false;
    }
    // When the remote-config flag is on, show for other media types once
    // markArtworkLoading has flipped showLoading.
    return showLoading && globalLoading && showRenderLoadingOverlay;
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
                // Committed (not live) settings: the on-screen artwork keeps
                // its own item's fit until the transition commits.
                objectFit: convertScalingToObjectFit(
                  committedVisualSettings?.scaling
                ),
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
            type={slot.mimeType ?? undefined}
            onLoad={() => {
              loadedSource(slotIndex, slot);
            }}
            onError={() => {
              handleLoadIframeError(slotIndex, slot);
            }}>
            Not supported
          </object>
        )}
        {slot.previewType === PreviewHTMLTag.model && (
          <div style={{ width: '100%', height: '100%' }}>
            <ModelViewerScreen
              key={slot.iframeKey}
              src={slot.displayPreviewURL}
              onLoad={() => {
                handleModelLoad(slotIndex, slot);
              }}
              onError={() => {
                handleModelLoadError(slotIndex, slot);
              }}
            />
          </div>
        )}
        {slot.previewType === PreviewHTMLTag.video && (
          <video
            // iframeKey is bumped on every slot setup; using it as React key
            // unmounts the old <video> instance when the slot is recreated
            // (e.g. on reload or itemIdentity change with same URL), which
            // discards any pending `ended` event still queued for the prior
            // playback.
            key={`v-${String(slot.iframeKey)}`}
            ref={videoRefs[slotIndex]}
            style={{
              width: '100%',
              height: '100%',
              // Committed (not live) settings: the on-screen artwork keeps
              // its own item's fit until the transition commits. `loop` /
              // `autoPlay` below intentionally stay LIVE — they are
              // behavioral (end-of-stream gating), not visual staging, and
              // must reflect the current item's contract immediately.
              objectFit: convertScalingToObjectFit(
                committedVisualSettings?.scaling
              ),
            }}
            autoPlay={false}
            loop={displaySettings?.loop ?? true}
            playsInline
            crossOrigin="anonymous"
            // Gate by itemIdentity AND previewURL together. Identity alone
            // is unstable across refresh-style updates that keep the same
            // item id but change the source; URL alone collapses adjacent
            // playlist items that share the same source. Both must match
            // the current target before we treat the `ended` as the
            // current item's end-of-stream.
            onEnded={() => {
              const slot = slotsRef.current[slotIndex];
              if (
                slot &&
                slot.itemIdentity.length > 0 &&
                slot.itemIdentity === itemIdentityRef.current &&
                slot.previewURL === previewURLRef.current
              ) {
                onSourceEnded?.(slot.itemIdentity);
              }
            }}
          />
        )}
        {slot.previewType === PreviewHTMLTag.audio && (
          <audio
            key={`a-${String(slot.iframeKey)}`}
            ref={audioRefs[slotIndex]}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}
            onEnded={() => {
              const slot = slotsRef.current[slotIndex];
              if (
                slot &&
                slot.itemIdentity.length > 0 &&
                slot.itemIdentity === itemIdentityRef.current &&
                slot.previewURL === previewURLRef.current
              ) {
                onSourceEnded?.(slot.itemIdentity);
              }
            }}
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
                handleIframeLoad(slotIndex, slot);
              }}
              onError={() => {
                handleLoadIframeError(slotIndex, slot);
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
                handleIframeLoad(slotIndex, slot);
              }}
              onError={() => {
                handleLoadIframeError(slotIndex, slot);
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
          // Committed settings, not live: background/margin swap only when a
          // transition commits so the outgoing artwork never restyles early.
          // The background-color transition softens the commit-time swap in
          // letterbox/margin areas (the artworks themselves crossfade).
          backgroundColor: committedVisualSettings?.background ?? '#000000',
          justifyContent: 'center',
          position: 'relative',
          transition: 'padding 0.2s ease, background-color 0.2s ease',
          padding: committedVisualSettings?.margin
            ? getDP1Margin(committedVisualSettings.margin)
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
