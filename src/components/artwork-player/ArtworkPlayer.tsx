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
  resolveArtworkSourceURL,
  ContentTypeDetectionError,
} from '@/utils/helper';
import CursorLayer, { CursorLayerHandle } from '../CursorLayer';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { useArtworkSettings } from '@/services/custom-hooks/useArtworkSettings';
import ModelViewerScreen from '../model-viewer/ModelViewerScreen';

const MAX_RECOVERY_TIME = 60000 * 10;
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
  const itemIdentityRef = useRef(itemIdentity ?? '');
  const slotsRef = useRef(slots);
  const activeSlotRef = useRef(activeSlot);
  const slotOpacityRef = useRef<[number, number]>(slotOpacity);

  const cursorRef = useRef<CursorLayerHandle>(null);

  // ---- Degraded-playback signal ------------------------------------------
  // "The artwork this player is currently trying to show failed to load."
  // Every failure path below deliberately still commits its slot through
  // `loadedSource` (abandoning the incoming claim wedges the visual-settings
  // latch — see handleMediaError), so the commit point cannot tell success
  // from failure; the outcome is recorded at the error and success sites
  // instead. AppContext lifts the flag so two consumers can act on it: the
  // reconnect-recovery refresh, and the setup background, which puts the
  // bundled offline artwork on screen instead of a black frame.
  //
  // A ref holds the failing URL and only genuine transitions reach context,
  // so repeated failures on the same artwork cost no re-render.
  const { setPlaybackDegraded } = context;
  const degradedURLRef = useRef<string | null>(null);
  const notePlaybackOutcome = useCallback(
    (url: string, failed: boolean) => {
      // Staleness is checked in two halves, and callers must satisfy both.
      // This is the argument-based half: `url` is the URL the reporting
      // layer was actually rendering, so a load that settles after the
      // playlist moved on says nothing about what is on the wall now and is
      // dropped. `loadedSource` owns the slot-based half — whether this slot
      // is the one whose commit the transition pipeline accepted — which is
      // why nearly every call site below sits inside its gate.
      if (url !== previewURLRef.current) {
        return;
      }
      const nextDegradedURL = failed ? url : null;
      if (degradedURLRef.current === nextDegradedURL) {
        return;
      }
      degradedURLRef.current = nextDegradedURL;
      setPlaybackDegraded?.(failed, url);
    },
    [setPlaybackDegraded]
  );

  // ---- M7 damping, Layer 1 (cross-repo recovery design §4.4) ------------
  // Per-slot, per-mount latch: once a video/audio mount has reported a
  // FAILURE, a later `loadeddata` on that SAME mount must not clear the
  // degraded flag. Without this, a video/audio element that errors and then
  // fires a stray `loadeddata` (browsers do this — a partially-buffered
  // element can still reach `loadeddata` after `error`) flips the flag
  // false and immediately true again on the next real error, turning one
  // genuine failure into a rapid clear/re-raise cycle that re-triggers
  // AppContext's reconnect-recovery refresh on every flap. One-shot in the
  // success→clear direction only: a failure can still supersede an earlier
  // success within the same mount (handleMediaError always reports). Reset
  // at slot creation (a NEW mount — fresh iframeKey — deserves a fresh
  // chance), not on every media-setup effect re-run. Image/iframe/object
  // success paths are unaffected; their failure signals do not exhibit this
  // flap (see DEVICE_LOCAL_PLAYER.md's per-type known-gaps list).
  const mountFailedRef = useRef<[boolean, boolean]>([false, false]);

  /**
   * The URL a slot is actually rendering. Handlers that only receive a
   * slotIndex report through this rather than `previewURLRef.current`, which
   * would make notePlaybackOutcome's guard compare a value against itself.
   */
  const slotPreviewURL = (slotIndex: SlotIndex) =>
    slotsRef.current[slotIndex]?.previewURL ?? '';

  // Moving to a different artwork (or unmounting) invalidates the flag: the
  // previous item's failure must not hold the offline backdrop over an
  // artwork that is loading fine. "Different artwork" is previewURL OR
  // itemIdentity — adjacent playlist items may share a URL, and the slot
  // pipeline treats an identity change as a real transition, so the flag
  // must reset with it or the stale failure suppresses the fresh degraded
  // edge reconnect recovery listens for. A same-item remount — which is
  // exactly what the reconnect recovery triggers (artworkReloadTick changes,
  // identity does not) — intentionally does NOT clear it, so a retry that
  // fails again stays degraded and only a real success clears it.
  useEffect(() => {
    return () => {
      if (degradedURLRef.current === null) {
        return;
      }
      degradedURLRef.current = null;
      setPlaybackDegraded?.(false);
    };
  }, [previewURL, itemIdentity, setPlaybackDegraded]);

  // ---- Latched visual settings -------------------------------------------
  // `displaySettings` flips to the NEXT item's preferences the moment the
  // playlist advances, but the incoming artwork only becomes visible after
  // load + fade (often seconds later). Painting background/margin/scaling
  // straight from `displaySettings` restyled the OUTGOING artwork with the
  // incoming item's settings for that whole window (background snapping
  // early, margins resizing the old artwork). The stage therefore renders
  // from `committedVisualSettings`, which swaps only at the moments a
  // transition commits (`setActiveSlot`), so whatever is on screen always
  // pairs with its own item's visual settings.
  //
  // Trade-off: during the crossfade the INCOMING slot briefly renders with
  // the outgoing item's scaling. That is bounded (FADE_IN_OUT_DURATION_MS,
  // at partial opacity) and strictly less visible than the old behavior —
  // the fully-visible outgoing artwork restyling seconds before the swap.
  const [committedVisualSettings, setCommittedVisualSettings] =
    useState(displaySettings);
  const displaySettingsRef = useRef(displaySettings);
  useLayoutEffect(() => {
    displaySettingsRef.current = displaySettings;
  }, [displaySettings]);

  /** Swap the stage onto the settings that are current at commit time. */
  const commitVisualSettings = useCallback(() => {
    setCommittedVisualSettings(displaySettingsRef.current);
  }, []);

  // Settings changes that arrive while NO transition is pending (e.g. the
  // user adjusts background/margin from the app for the artwork already on
  // screen) must apply immediately — only transition-driven changes wait
  // for commit. "Pending" covers both a claimed incoming slot and the gap
  // where `previewURL` moved ahead of the committed active layer but the
  // slot-setup effect has not claimed an incoming slot yet.
  useEffect(() => {
    const activeLayer = slotsRef.current[activeSlotRef.current];
    const transitionPending =
      incomingSlotRef.current !== null ||
      (activeLayer !== null &&
        activeLayer.previewURL !== previewURLRef.current);
    if (!transitionPending) {
      setCommittedVisualSettings(displaySettings);
    }
  }, [displaySettings]);

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
    (slotIndex: SlotIndex) => {
      const currentURL = previewURLRef.current;
      const slot = slotsRef.current[slotIndex];
      if (slot?.previewURL !== currentURL) {
        return false;
      }

      // If incomingSlotRef gets out-of-sync (e.g. playlist boundary / rapid source churn),
      // allow rebind only when the currently pointed slot no longer matches current URL.
      const currentIncoming = incomingSlotRef.current;
      if (currentIncoming !== null && currentIncoming !== slotIndex) {
        const incomingLayer = slotsRef.current[currentIncoming];
        if (incomingLayer?.previewURL === currentURL) {
          return false;
        }
      }
      incomingSlotRef.current = slotIndex;
      markSlotReady(slotIndex);
      return true;
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
      const playPromise = videoElement.play() as Promise<void> | undefined;
      if (!playPromise) {
        loadedSource(slotIndex);
        return;
      }

      void playPromise
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
          if (data.fatal) {
            hlsInstance?.destroy();
            if (hlsInstancesRef.current[slotIndex] === hlsInstance) {
              hlsInstancesRef.current[slotIndex] = null;
            }
            return;
          }
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
    [playVideoForSlot]
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
      commitVisualSettings();
      setSlotOpacity(readySlot === 0 ? [1, 0] : [0, 1]);
      setActiveSlot(readySlot);
      incomingSlotRef.current = null;
      setTopSlotIndex(null);
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
        // Sequential handoff: this fade-in is the first moment the incoming
        // work is on the wall.
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
    }, FADE_IN_OUT_DURATION_MS);
  }, [slots, pauseSlotPlayback, commitVisualSettings, onItemCommitted]);

  const handleIframeLoad = (slotIndex: SlotIndex) => {
    if (isWebGLAvailable()) {
      setShowMessageModal(false);
      if (loadedSource(slotIndex)) {
        // Known limitation: a cross-origin iframe fires `load` even when the
        // browser rendered its own network-error page, so an offline iframe
        // artwork reads as a success here and never raises the degraded
        // flag. Nothing in-page can inspect that document; `onError` (below)
        // stays the only signal we can trust for this preview type.
        //
        // Worse, the iframe is also where type detection FAILURES land:
        // offline, `getContentTypeFromURL`'s HEAD dies and an extensionless
        // source pins here as a guess (detectPreviewType's catch, marked by
        // `mimeType: null`). That `load` says nothing about the artwork —
        // scoring it as success would CLEAR a degraded flag raised by the
        // real preview type on exactly the offline boot the reconnect
        // recovery exists for, so only a confidently-typed iframe reports.
        // The guessed typing is not sticky: the recovery's remount re-runs
        // detection once the network is back, and the artwork's real type
        // takes over the signals.
        if (slotsRef.current[slotIndex]?.mimeType !== null) {
          notePlaybackOutcome(slotPreviewURL(slotIndex), false);
        }
      }
    } else {
      handleWebGLLost();
    }
  };

  const handleModelLoad = (slotIndex: SlotIndex) => {
    if (loadedSource(slotIndex)) {
      notePlaybackOutcome(slotPreviewURL(slotIndex), false);
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
   */
  const handleModelLoadError = (slotIndex: SlotIndex) => {
    if (!loadedSource(slotIndex)) {
      return;
    }

    notePlaybackOutcome(slotPreviewURL(slotIndex), true);
    clearLoadingIndicators();
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

    setGlobalLoading(true);
    setShowLoading(false);
    if (loadingDelayRef.current) {clearTimeout(loadingDelayRef.current);}
    loadingDelayRef.current = setTimeout(() => {
      if (!cancelled && previewURLRef.current === url) {
        setShowLoading(true);
      }
    }, 2000);

    const identity = itemIdentityRef.current;
    // Derived from activeSlotRef/slotsRef, not from the setSlots updater's
    // `prev` — the updater must stay a pure function of its argument, and
    // `incomingSlotRef`/`mountFailedRef` are refs, not state, so writing
    // them from inside it is a render-phase side effect React may invoke
    // more than once for the same commit.
    const hasAny = slotsRef.current[currentActive] !== null;
    const targetSlot: SlotIndex = hasAny
      ? ((currentActive === 0 ? 1 : 0) as SlotIndex)
      : currentActive;
    incomingSlotRef.current = targetSlot;
    // Fresh mount: give it a clean one-shot latch (see the Layer-1 damping
    // comment above).
    mountFailedRef.current[targetSlot] = false;
    setSlots(prev => {
      if (!hasAny) {
        const k = ++iframeKeyCounterRef.current;
        const next: [SlotLayer | null, SlotLayer | null] = [null, null];
        next[targetSlot] = createSlotLayer(url, k, identity);
        return next;
      }
      const k = ++iframeKeyCounterRef.current;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[targetSlot] = createSlotLayer(url, k, identity);
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
        // Detection failure is a first-class outcome, not just a typing
        // guess: getContentTypeFromURL's HEAD dies offline (or on any other
        // network-level failure) exactly as often as it dies on a merely
        // unhelpful response (4xx/5xx, or 2xx with no Content-Type header —
        // server reachable, type just unknown). The fallback iframe below
        // covers BOTH cases identically (something still renders), but only
        // the network case is evidence the artwork itself is currently
        // unreachable — a reached-but-untyped source is a healthy artwork
        // this device simply can't classify, and must NOT be marked
        // degraded on that basis alone.
        //
        // A false positive here is cheap to correct even so: the M7 Layer-2
        // budget (AppContext) bounds any refresh consequences, and the
        // offline backdrop only shows when offline signals corroborate
        // (`(!isOnline || !browserOnline) && playbackDegraded` in
        // SetupArtworkBackground) — a stray degraded report on a genuinely
        // healthy, online wall cannot black it out on its own.
        //
        // Loop closure: raising the flag here does not strand it guessed.
        // The reconnect-recovery refresh bumps `artworkReloadTick`, which is
        // in this effect's deps, so detection re-runs on the SAME url; a
        // now-successful HEAD takes the confidently-typed `.then` branch
        // above (real `mimeType`, not null), and handleIframeLoad's own
        // `mimeType !== null` gate (see its comment) is exactly what lets
        // THAT mount's success reporting clear the flag.
        if (
          error instanceof ContentTypeDetectionError &&
          error.isNetworkFailure
        ) {
          notePlaybackOutcome(url, true);
          // Corroborated network failure: do NOT commit the fallback iframe.
          // The device is provably offline, so an iframe pointed at the
          // remote source cannot render the artwork — Chromium paints its
          // own net-error page inside the frame, which becomes visible the
          // moment the offline backdrop lifts on reconnect (field bug: the
          // "dinosaur" flash after an offline boot). The slot stays pending
          // (previewType null renders nothing; renderSlot bails on it), the
          // degraded flag raised above drives the reconnect-recovery
          // refresh, and that refresh bumps `artworkReloadTick` to re-run
          // detection on the same URL once the network is back. The
          // fallback below stays reserved for the reached-but-untyped case,
          // where a render attempt can genuinely succeed.
          return;
        }
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
          console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
          Sentry.captureMessage(`[ArtworkPlayer] ${mediaType} load failed`, {
            level: 'error',
            extra: { displayPreviewURL: layer.displayPreviewURL, mediaType },
          });
          // Commit the failed slot through the transition pipeline (same
          // contract as handleModelLoadError): a claim abandoned on failure
          // wedges the visual-settings latch — incomingSlotRef stays set,
          // every later settings update reads as "transition pending", and
          // the artwork on screen stops receiving settings until the next
          // artwork request. loadedSource's URL guard drops stale failures.
          if (loadedSource(slotIndex)) {
            // Only a failure loadedSource actually accepted describes what
            // the device is trying to show; a rejected one belongs to a
            // superseded slot and must not mark playback degraded.
            if (mediaType === 'video' || mediaType === 'audio') {
              // Layer-1 latch: this mount is now barred from clearing the
              // flag via a later loadeddata success (image is unaffected —
              // see the damping comment above).
              mountFailedRef.current[slotIndex] = true;
            }
            notePlaybackOutcome(layer.previewURL, true);
          }
      };

      const loadMedia = async () => {
        if (isCancelled) {return;}
        if (
          layer.previewType === PreviewHTMLTag.image &&
          imageRefs[slotIndex].current
        ) {
          const el = imageRefs[slotIndex].current;
          // Pre-decode before reporting ready: without it, a large image's
          // first rasterization lands on the first painted frame of the
          // crossfade and janks it on kiosk hardware. decode() rejections
          // (or browsers without it) still mark the slot ready — painting
          // undecoded is the old behavior, not an error, and loadedSource's
          // URL guard drops stale results if the slot moved on meanwhile.
          const markImageReady = () => {
            let decoded: Promise<unknown>;
            try {
              decoded =
                typeof el.decode === 'function'
                  ? el.decode()
                  : Promise.resolve();
            } catch {
              decoded = Promise.resolve();
            }
            void decoded
              .catch(() => undefined)
              .finally(() => {
                if (!isCancelled && loadedSource(slotIndex)) {
                  // Genuine success site: `onload` fired, so the bytes
                  // arrived. `loadedSource` alone cannot serve as the
                  // success signal — the failure paths call it too.
                  notePlaybackOutcome(layer.previewURL, false);
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
            // Defensive parity with el.onload: the loader currently never
            // invokes onLoad (it only sets src), but if it ever does, the
            // decode gate must not be bypassed.
            onLoad: markImageReady,
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
            // `loadeddata` is the unambiguous success moment for progressive
            // video. playVideoForSlot's own loadedSource call is not usable
            // as one: it fires from play()'s `finally`, i.e. on a rejected
            // play just as much as a resolved one.
            //
            // Guarded like loadedSource's competing-claim check, but without
            // its side effects (claiming the slot here would start the
            // crossfade before play() is even called). Adjacent playlist
            // items may share a previewURL, so the URL guard inside
            // notePlaybackOutcome alone would let a late `loadeddata` from
            // the PREVIOUS item clear a failure raised by the current one.
            const claimed = incomingSlotRef.current;
            if (
              (claimed === null || claimed === slotIndex) &&
              !mountFailedRef.current[slotIndex]
            ) {
              notePlaybackOutcome(layer.previewURL, false);
            }
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
            const claimed = loadedSource(slotIndex);
            if (claimed && !mountFailedRef.current[slotIndex]) {
              notePlaybackOutcome(layer.previewURL, false);
            }
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
    [loadedSource, notePlaybackOutcome, playVideoForSlot]
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
          !isModelMimeType(slot.mimeType ?? '')
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
          const resolvedURL = resolveArtworkSourceURL(slot.displayPreviewURL);
          // A data URL's query-like text is content, not URL search params;
          // mutating it corrupts raw HTML/SVG payloads accepted at the cast
          // boundary. Relative web URLs are resolved only for this iframe
          // setting, leaving the persisted/display source unchanged.
          if (resolvedURL.protocol !== 'data:') {
            resolvedURL.search += `&display_mode=${displayMode}`;
            softwareURL = resolvedURL.toString();
          }
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

  const handleLoadIframeError = (slotIndex: SlotIndex) => {
    // Route the failure through the transition pipeline like model failures
    // (handleModelLoadError): abandoning the incoming claim wedges the
    // visual-settings latch and the on-screen artwork stops receiving
    // settings updates until the next artwork request. A stale slot (the
    // playlist already moved on) commits nothing and must not raise the
    // modal over the artwork that superseded it.
    if (!loadedSource(slotIndex)) {
      return;
    }
    notePlaybackOutcome(slotPreviewURL(slotIndex), true);
    clearLoadingIndicators();
    updateSlot(slotIndex, { loading: false });
    setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    setShowMessageModal(true);
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
    const isModelAsset = isModelMimeType(layer?.mimeType ?? '');
    return (
      showLoading &&
      globalLoading &&
      (t === null ||
        t === PreviewHTMLTag.video ||
        t === PreviewHTMLTag.audio ||
        t === PreviewHTMLTag.model ||
        isModelAsset)
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
              loadedSource(slotIndex);
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
                handleModelLoad(slotIndex);
              }}
              onError={() => {
                handleModelLoadError(slotIndex);
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
