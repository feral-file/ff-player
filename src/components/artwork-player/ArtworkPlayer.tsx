import { MessageModalType } from '@/models';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
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
  interface ArtworkSlot {
    previewURL: string;
    displayPreviewURL: string;
    displaySoftwareURL: string;
    previewType: PreviewHTMLTag | null;
    isStreaming: boolean;
    isLoading: boolean;
    opacity: number;
    iframeKey: number;
  }

  const [slots, setSlots] = useState<[ArtworkSlot | null, ArtworkSlot | null]>([
    null,
    null,
  ]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [incomingSlotIndex, setIncomingSlotIndex] = useState<number | null>(
    null
  );
  const [showLoadingIndicator, setShowLoadingIndicator] =
    useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [messageModalText, setMessageModalText] = useState<string | null>(null);
  const [messageModalTitle, setMessageModalTitle] = useState<string | null>(
    null
  );
  const transitionTimeoutRef = useRef<NodeJS.Timeout>();
  const iframeRefs = [
    useRef<HTMLIFrameElement>(null),
    useRef<HTMLIFrameElement>(null),
  ];
  const webGLRecoveryIntervalRef = useRef<NodeJS.Timeout>();
  const loadingDelayRef = useRef<NodeJS.Timeout>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWebGLContextLost = useRef<boolean>(false);

  // Media loading refs
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

  // Media loader for CORS handling
  const mediaLoaders = [
    useRef(createMediaLoader()),
    useRef(createMediaLoader()),
  ];

  // Cursor layer handle
  const cursorRef = useRef<CursorLayerHandle>(null);

  const slotsRef = useRef(slots);
  const activeSlotIndexRef = useRef(activeSlotIndex);
  const incomingSlotIndexRef = useRef(incomingSlotIndex);
  const transitionTokenRef = useRef(0);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    activeSlotIndexRef.current = activeSlotIndex;
  }, [activeSlotIndex]);

  useEffect(() => {
    incomingSlotIndexRef.current = incomingSlotIndex;
  }, [incomingSlotIndex]);

  const determinePreviewType = (type: string) => {
    let previewType = PreviewHTMLTag.iframe;
    let isStreaming = false;

    if (!type) {
      return { previewType, isStreaming };
    }

    const normalizedType = type.toLowerCase();

    if (MIMETypeStreamVideo.includes(normalizedType)) {
      previewType = PreviewHTMLTag.video;
      isStreaming = true;
    } else if (MITETypeIframe.includes(normalizedType)) {
      previewType = PreviewHTMLTag.iframe;
    } else if (normalizedType.match(MIMETypeSvg)) {
      previewType = PreviewHTMLTag.object;
    } else if (
      FileUseObject.includes(normalizedType) ||
      normalizedType.match(MIMETypeObject)
    ) {
      previewType = PreviewHTMLTag.object;
    } else if (
      FileUseVideo.includes(normalizedType) ||
      normalizedType.match(MIMETypeVideo)
    ) {
      previewType = PreviewHTMLTag.video;
    } else if (
      FileUseAudio.includes(normalizedType) ||
      normalizedType.match(MIMETypeAudio)
    ) {
      previewType = PreviewHTMLTag.audio;
    } else if (
      FileUseImage.includes(normalizedType) ||
      normalizedType.match(MIMETypeImage)
    ) {
      previewType = PreviewHTMLTag.image;
    } else if (
      FileUseIframePDF.includes(normalizedType) ||
      normalizedType.match(MIMETypePdf)
    ) {
      previewType = PreviewHTMLTag.iframePDF;
    }

    return { previewType, isStreaming };
  };

  const getDisplaySoftwareURL = (
    url: string,
    previewType: PreviewHTMLTag | null,
    displaySettings?: DP1DisplayPreference
  ) => {
    if (!url) {
      return '';
    }

    if (
      previewType === PreviewHTMLTag.iframe &&
      displaySettings &&
      !url.includes('base64')
    ) {
      const displayMode =
        displaySettings.scaling === Scaling.Fill ? 'crop' : 'fit';
      const queryParam = `&display_mode=${displayMode}`;
      const nextURL = new URL(url);
      nextURL.search += queryParam;
      return nextURL.toString();
    }

    return url;
  };

  const reTryToPlayVideo = (slotIndex: number) => {
    const videoElement = videoRefs[slotIndex].current;
    if (videoElement) {
      videoElement.muted = true;
      videoElement.play().catch((error: unknown) => {
        console.log('[ArtworkPlayer] Error play video', JSON.stringify(error));
        Sentry.captureMessage('[ArtworkPlayer] Error play video');
      });
    }
  };

  const handleUnmuteClick = () => {
    const activeIndex = activeSlotIndexRef.current;
    const videoElement = videoRefs[activeIndex].current;
    const slot = slotsRef.current[activeIndex];
    if (slot?.previewType === PreviewHTMLTag.video && videoElement) {
      videoElement.muted = false;
      document.removeEventListener('click', handleUnmuteClick);
    }
  };

  const updateSlot = (slotIndex: number, updates: Partial<ArtworkSlot>) => {
    setSlots(prev => {
      const slot = prev[slotIndex];
      if (!slot) {
        return prev;
      }

      const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
      next[slotIndex] = { ...slot, ...updates };
      return next;
    });
  };

  const updateSlotIfCurrent = (
    slotIndex: number,
    url: string,
    updates: Partial<ArtworkSlot>
  ) => {
    setSlots(prev => {
      const slot = prev[slotIndex];
      if (slot?.previewURL !== url) {
        return prev;
      }

      const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
      next[slotIndex] = { ...slot, ...updates };
      return next;
    });
  };

  const focusSlotIframe = (slotIndex: number) => {
    const slot = slotsRef.current[slotIndex];
    if (
      slot?.previewType === PreviewHTMLTag.iframe ||
      slot?.previewType === PreviewHTMLTag.iframePDF
    ) {
      window.focus();
    }
  };

  const startCrossfade = (incomingIndex: number) => {
    const activeIndex = activeSlotIndexRef.current;

    if (activeIndex === incomingIndex) {
      return;
    }

    setSlots(prev => {
      const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
      const activeSlot = next[activeIndex];
      const incomingSlot = next[incomingIndex];
      if (activeSlot) {
        next[activeIndex] = { ...activeSlot, opacity: 0 };
      }
      if (incomingSlot) {
        next[incomingIndex] = { ...incomingSlot, opacity: 1 };
      }
      return next;
    });

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    transitionTokenRef.current += 1;
    const transitionToken = transitionTokenRef.current;

    transitionTimeoutRef.current = setTimeout(() => {
      if (transitionToken !== transitionTokenRef.current) {
        return;
      }

      setSlots(prev => {
        const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
        next[activeIndex] = null;
        return next;
      });
      setActiveSlotIndex(incomingIndex);
      setIncomingSlotIndex(null);
      transitionTimeoutRef.current = undefined;
      focusSlotIframe(incomingIndex);
    }, FADE_IN_OUT_DURATION_MS);
  };

  const markSlotLoaded = (slotIndex: number) => {
    const activeIndex = activeSlotIndexRef.current;
    const incomingIndex = incomingSlotIndexRef.current;
    const hasActive = Boolean(slotsRef.current[activeIndex]);

    updateSlot(slotIndex, { isLoading: false, opacity: 1 });
    console.log('[ArtworkPlayer] loaded source');

    if (!hasActive || activeIndex === slotIndex) {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = undefined;
      }
      transitionTokenRef.current += 1;

      setSlots(prev => {
        const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
        SLOT_INDICES.forEach(index => {
          if (index !== slotIndex) {
            next[index] = null;
          }
        });
        return next;
      });

      setActiveSlotIndex(slotIndex);
      setIncomingSlotIndex(null);
      focusSlotIframe(slotIndex);
      return;
    }

    if (incomingIndex === slotIndex) {
      startCrossfade(slotIndex);
    }
  };

  const handleIframeLoad = (slotIndex: number) => {
    console.log('[ArtworkPlayer] Iframe loaded');
    if (isWebGLAvailable()) {
      setShowMessageModal(false);
      markSlotLoaded(slotIndex);
    } else {
      handleWebGLLost();
    }
  };

  const handleLoadIframeError = (slotIndex: number) => {
    setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    setShowMessageModal(true);
    if (incomingSlotIndexRef.current === slotIndex) {
      setSlots(prev => {
        const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
        next[slotIndex] = null;
        return next;
      });
      setIncomingSlotIndex(null);
      return;
    }

    updateSlot(slotIndex, { isLoading: false, opacity: 1 });
  };

  // Update cursor positions when they change in context
  useEffect(() => {
    if (context.cursorPositions && context.cursorPositions.length > 0) {
      cursorRef.current?.setPositions(context.cursorPositions);
    }
  }, [context.cursorPositions]);

  useEffect(() => {
    let cancelled = false;
    const currentURL = previewURL;
    const activeIndex = activeSlotIndexRef.current;
    const hasActive = Boolean(slotsRef.current[activeIndex]?.displayPreviewURL);
    const targetIndex = hasActive ? (activeIndex === 0 ? 1 : 0) : activeIndex;
    const nextIframeKey = (slotsRef.current[targetIndex]?.iframeKey ?? 0) + 1;

    setSlots(prev => {
      const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
      next[targetIndex] = {
        previewURL: currentURL,
        displayPreviewURL: '',
        displaySoftwareURL: '',
        previewType: null,
        isStreaming: false,
        isLoading: true,
        opacity: 0,
        iframeKey: nextIframeKey,
      };
      return next;
    });

    setIncomingSlotIndex(hasActive ? targetIndex : null);

    const detectPreviewType = async (url: string) => {
      console.log(
        '[ArtworkPlayer] detectPreviewType',
        url.startsWith('http') ? url : 'data/text source'
      );
      const isStale = () => cancelled || url !== currentURL;

      try {
        if (artworkPreviewMIMEType) {
          if (isStale()) return;
          const { previewType, isStreaming } = determinePreviewType(
            artworkPreviewMIMEType
          );
          updateSlotIfCurrent(targetIndex, currentURL, {
            previewType,
            isStreaming,
          });
          console.log(
            '[CAST] Artwork previewMIMEType:',
            artworkPreviewMIMEType
          );
          Sentry.addBreadcrumb({
            category: 'ArtworkPlayer',
            message: 'play artwork',
            data: { previewURL: url, artworkPreviewMIMEType },
          });
          return;
        }

        const contentType = await getContentTypeFromURL(url);
        if (isStale()) return;

        const { previewType, isStreaming } = determinePreviewType(contentType);
        updateSlotIfCurrent(targetIndex, currentURL, {
          previewType,
          isStreaming,
        });
        console.log('[ArtworkPlayer] Content-Type:', contentType);
        Sentry.addBreadcrumb({
          category: 'ArtworkPlayer',
          message: 'play artwork',
          data: { previewURL: url, contentType },
        });
      } catch (error) {
        if (isStale()) return;
        console.log(
          '[ArtworkPlayer] Error detect preview type',
          JSON.stringify(error)
        );
        Sentry.captureException(error);
        updateSlotIfCurrent(targetIndex, currentURL, {
          previewType: PreviewHTMLTag.iframe,
        });
      }
    };

    if (previewURL) {
      detectPreviewType(previewURL)
        .catch((err: unknown) => {
          console.error(err);
        })
        .finally(() => {
          // Only apply result if this effect instance is still current
          if (!cancelled && previewURL === currentURL) {
            updateSlotIfCurrent(targetIndex, currentURL, {
              displayPreviewURL: previewURL,
              displaySoftwareURL: previewURL,
            });
          }
        });
    }

    return () => {
      cancelled = true;
      if (loadingDelayRef.current) {
        clearTimeout(loadingDelayRef.current);
        loadingDelayRef.current = undefined;
      }
    };
  }, [previewURL, artworkPreviewMIMEType]);

  useEffect(() => {
    const activeIndex = activeSlotIndexRef.current;
    const slot = slotsRef.current[activeIndex];
    if (slot?.previewType === PreviewHTMLTag.video) {
      document.addEventListener('click', handleUnmuteClick);
    }

    return () => {
      document.removeEventListener('click', handleUnmuteClick);
    };
  }, [activeSlotIndex, slots[0]?.previewType, slots[1]?.previewType]);

  // Video playback handling (after CORS loading)
  useEffect(() => {
    const cleanupFns: (() => void)[] = [];

    SLOT_INDICES.forEach(slotIndex => {
      const slot = slots[slotIndex];
      const videoElement = videoRefs[slotIndex].current;
      if (!slot || slot.previewType !== PreviewHTMLTag.video || !videoElement) {
        return;
      }

      const handleVideoPlay = () => {
        videoElement
          .play()
          .catch((error: unknown) => {
            console.log('Error play video', error);
            reTryToPlayVideo(slotIndex);
          })
          .finally(() => {
            if (slot.isStreaming) {
              markSlotLoaded(slotIndex);
            }
          });
      };

      let hlsInstance: Hls | null = null;

      if (
        slot.isStreaming &&
        Hls.isSupported() &&
        slot.displayPreviewURL.endsWith('.m3u8')
      ) {
        hlsInstance = new Hls({
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferLength: 30,
          liveSyncDuration: 10,
        });

        hlsInstance.attachMedia(videoElement);
        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          hlsInstance?.loadSource(
            `${slot.displayPreviewURL}?clientBandwidthHint=${CLIENT_BANDWIDTH_HINT.toString()}`
          );
          handleVideoPlay();
        });

        hlsInstance.on(Hls.Events.ERROR, function (event, data) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
                console.log('Buffer stall detected, attempting to recover...');
                hlsInstance?.recoverMediaError();
              }
              break;
            default:
              console.error('An unrecoverable error occurred');
              hlsInstance?.destroy();
              break;
          }
        });
      } else {
        // For non-streaming videos, play after loadeddata event
        videoElement.addEventListener('loadeddata', handleVideoPlay);
      }

      cleanupFns.push(() => {
        videoElement.removeEventListener('loadeddata', handleVideoPlay);
        hlsInstance?.destroy();
      });
    });

    return () => {
      cleanupFns.forEach(cleanup => {
        cleanup();
      });
    };
  }, [
    slots[0]?.previewType,
    slots[0]?.isStreaming,
    slots[0]?.displayPreviewURL,
    slots[1]?.previewType,
    slots[1]?.isStreaming,
    slots[1]?.displayPreviewURL,
  ]);

  // Universal media loading with CORS handling
  useEffect(() => {
    const effectCleanupFns: (() => void)[] = [];

    SLOT_INDICES.forEach(slotIndex => {
      const slot = slots[slotIndex];
      if (!slot?.displayPreviewURL) {
        return;
      }

      let isCancelled = false;
      const abortController = new AbortController();
      const mediaCleanupFns: (() => void)[] = [];

      const handleMediaError =
        (mediaType: BlobLoadedMediaType) => (error: Error) => {
          console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
          Sentry.captureMessage(`[ArtworkPlayer] ${mediaType} load failed`, {
            level: 'error',
            extra: { displayPreviewURL: slot.displayPreviewURL, mediaType },
          });
        };

      const markCurrentSlotLoaded = () => {
        markSlotLoaded(slotIndex);
      };

      const loadMedia = async () => {
        if (isCancelled) {
          return;
        }

        if (
          slot.previewType === PreviewHTMLTag.image &&
          imageRefs[slotIndex].current
        ) {
          const imageElement = imageRefs[slotIndex].current;
          imageElement.onload = markCurrentSlotLoaded;
          imageElement.onerror = () => {
            handleMediaError('image')(new Error('Image load failed'));
          };
          mediaCleanupFns.push(() => {
            imageElement.onload = null;
            imageElement.onerror = null;
          });

          await mediaLoaders[slotIndex].current.loadMedia({
            url: slot.displayPreviewURL,
            mediaType: 'image',
            element: imageElement,
            onLoad: markCurrentSlotLoaded,
            onError: handleMediaError('image'),
            signal: abortController.signal,
          });
          return;
        }

        if (
          slot.previewType === PreviewHTMLTag.video &&
          videoRefs[slotIndex].current &&
          !slot.isStreaming
        ) {
          const videoElement = videoRefs[slotIndex].current;
          videoElement.onloadeddata = markCurrentSlotLoaded;
          videoElement.onerror = () => {
            handleMediaError('video')(new Error('Video load failed'));
          };
          mediaCleanupFns.push(() => {
            videoElement.onloadeddata = null;
            videoElement.onerror = null;
          });

          console.log('[ArtworkPlayer] loading video', slot.displayPreviewURL);
          await mediaLoaders[slotIndex].current.loadMedia({
            url: slot.displayPreviewURL,
            mediaType: 'video',
            element: videoElement,
            onLoad: markCurrentSlotLoaded,
            onError: handleMediaError('video'),
            signal: abortController.signal,
          });
          return;
        }

        if (
          slot.previewType === PreviewHTMLTag.audio &&
          audioRefs[slotIndex].current
        ) {
          const audioElement = audioRefs[slotIndex].current;
          audioElement.onloadeddata = markCurrentSlotLoaded;
          audioElement.onerror = () => {
            handleMediaError('audio')(new Error('Audio load failed'));
          };
          mediaCleanupFns.push(() => {
            audioElement.onloadeddata = null;
            audioElement.onerror = null;
          });

          await mediaLoaders[slotIndex].current.loadMedia({
            url: slot.displayPreviewURL,
            mediaType: 'audio',
            element: audioElement,
            onLoad: markCurrentSlotLoaded,
            onError: handleMediaError('audio'),
            signal: abortController.signal,
          });
        }
      };

      void loadMedia();

      effectCleanupFns.push(() => {
        isCancelled = true;
        abortController.abort();
        mediaCleanupFns.forEach(cleanup => {
          cleanup();
        });
        mediaLoaders[slotIndex].current.cleanup();
      });
    });

    return () => {
      effectCleanupFns.forEach(cleanup => {
        cleanup();
      });
    };
  }, [
    slots[0]?.displayPreviewURL,
    slots[0]?.previewType,
    slots[0]?.isStreaming,
    slots[1]?.displayPreviewURL,
    slots[1]?.previewType,
    slots[1]?.isStreaming,
  ]);
  // ---- End of universal media loading with CORS handling ----

  useEffect(() => {
    slotsRef.current.forEach((slot, index) => {
      const videoElement = videoRefs[index].current;
      if (!slot || slot.previewType !== PreviewHTMLTag.video || !videoElement) {
        return;
      }

      if (context.isOnline) {
        videoElement.play().catch((error: unknown) => {
          console.log(
            '[ArtworkPlayer] Error play video',
            JSON.stringify(error)
          );
          Sentry.captureMessage('[ArtworkPlayer] Error play video');
        });
      } else {
        videoElement.pause();
      }
    });
  }, [context.isOnline, slots[0]?.previewType, slots[1]?.previewType]);

  useEffect(() => {
    if (!context.deviceRotation?.viewMode || !displaySettings) {
      return;
    }

    console.log(
      '[ArtworkPlayer] displaySettings',
      JSON.stringify(displaySettings)
    );

    setSlots(prev => {
      const next = [...prev] as [ArtworkSlot | null, ArtworkSlot | null];
      next.forEach((slot, index) => {
        if (!slot?.displayPreviewURL) {
          return;
        }

        next[index] = {
          ...slot,
          displaySoftwareURL: getDisplaySoftwareURL(
            slot.displayPreviewURL,
            slot.previewType,
            displaySettings
          ),
        };
      });
      return next;
    });
  }, [displaySettings, context.deviceRotation?.viewMode]);

  const reloadIframe = () => {
    console.log('[ArtworkPlayer] reloadIframe');
    const activeIndex = activeSlotIndexRef.current;
    const currentKey = slotsRef.current[activeIndex]?.iframeKey ?? 0;
    updateSlot(activeIndex, { iframeKey: currentKey + 1 });
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
    updateSlot(activeSlotIndexRef.current, { opacity: 0 });
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

        console.log('[ArtworkPlayer] WebGL recovered!');
        isWebGLContextLost.current = false;
        setTimeout(() => {
          reloadIframe();
        }, 2000);
      } else {
        console.log(
          '[ArtworkPlayer] WebGL still unavailable - attempting recovery'
        );
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
      if (webGLRecoveryIntervalRef.current) {
        clearInterval(webGLRecoveryIntervalRef.current);
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
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

  const activeSlot = slots[activeSlotIndex];
  const showLoading = showLoadingIndicator;

  useEffect(() => {
    if (!activeSlot?.previewType) {
      setShowLoadingIndicator(false);
      return;
    }

    const shouldDelayLoading =
      activeSlot.previewType === PreviewHTMLTag.video ||
      activeSlot.previewType === PreviewHTMLTag.audio;

    if (!activeSlot.isLoading || !shouldDelayLoading) {
      setShowLoadingIndicator(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShowLoadingIndicator(true);
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
      setShowLoadingIndicator(false);
    };
  }, [activeSlot?.isLoading, activeSlot?.previewType]);

  const renderSlot = (slot: ArtworkSlot | null, slotIndex: number) => {
    if (!slot?.displayPreviewURL || !slot.previewType) {
      return null;
    }

    return (
      <div
        key={slot.previewURL}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          opacity: slot.opacity,
          transition: `opacity ${FADE_IN_OUT_DURATION_MS.toString()}ms ease`,
          willChange: 'opacity',
          zIndex: slotIndex === activeSlotIndex ? 1 : 2,
          pointerEvents: slot.opacity === 0 ? 'none' : 'auto',
        }}>
        {slot.previewType === PreviewHTMLTag.image && (
          <div
            style={{
              width: '100%',
              height: '100%',
            }}
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
              markSlotLoaded(slotIndex);
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
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}
            playsInline
            crossOrigin="anonymous"></video>
        )}
        {slot.previewType === PreviewHTMLTag.audio && (
          <audio
            ref={audioRefs[slotIndex]}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}></audio>
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
              tabIndex={0}></iframe>
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
              tabIndex={0}></iframe>
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
        {showLoading && <Loading />}
        {slots.map((slot, index) => renderSlot(slot, index))}
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
