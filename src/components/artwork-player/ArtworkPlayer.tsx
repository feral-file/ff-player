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
  const FADE_IN_OUT_DURATION_MS = 350;
  const { context } = useAppContext();
  const [opacity, setOpacity] = useState(1);
  const [displayPreviewURL, setDisplayPreviewURL] = useState<string>('');
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [displaySoftwareURL, setDisplaySoftwareURL] =
    useState<string>(previewURL);
  const [loading, setLoading] = useState<boolean>(true);
  const [showLoading, setShowLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [messageModalText, setMessageModalText] = useState<string | null>(null);
  const [messageModalTitle, setMessageModalTitle] = useState<string | null>(
    null
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const webGLRecoveryIntervalRef = useRef<NodeJS.Timeout>();
  const loadingDelayRef = useRef<NodeJS.Timeout>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWebGLContextLost = useRef<boolean>(false);

  // Media loading refs
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { displaySettings } = useArtworkSettings(displayPreferences);

  // Media loader for CORS handling
  const mediaLoader = useRef(createMediaLoader());

  // Cursor layer handle
  const cursorRef = useRef<CursorLayerHandle>(null);

  function compareToGetFileType(type: string) {
    setIsStreaming(false);
    if (!type) {
      return;
    }
    type = type.toLowerCase();

    if (MIMETypeStreamVideo.includes(type)) {
      setPreviewType(PreviewHTMLTag.video);
      setIsStreaming(true);
    } else if (MITETypeIframe.includes(type)) {
      setPreviewType(PreviewHTMLTag.iframe);
    } else if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
      setPreviewType(PreviewHTMLTag.object);
    } else if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
      setPreviewType(PreviewHTMLTag.video);
    } else if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
      setPreviewType(PreviewHTMLTag.audio);
    } else if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
      setPreviewType(PreviewHTMLTag.image);
    } else if (FileUseIframePDF.includes(type) || type.match(MIMETypePdf)) {
      setPreviewType(PreviewHTMLTag.iframePDF);
    } else {
      setPreviewType(PreviewHTMLTag.iframe);
    }
  }

  const reTryToPlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch((error: unknown) => {
        console.log('[ArtworkPlayer] Error play video', JSON.stringify(error));
        Sentry.captureMessage('[ArtworkPlayer] Error play video');
      });
    }
  };

  const unmuteVideo = () => {
    if (previewType === PreviewHTMLTag.video && videoRef.current) {
      videoRef.current.muted = false;
      document.removeEventListener('click', unmuteVideo);
    }
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

    const detectPreviewType = async (url: string) => {
      console.log(
        '[ArtworkPlayer] detectPreviewType',
        url.startsWith('http') ? url : 'data/text source'
      );
      const isStale = () => cancelled || url !== currentURL;

      try {
        if (artworkPreviewMIMEType) {
          if (isStale()) return;
          compareToGetFileType(artworkPreviewMIMEType);
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

        compareToGetFileType(contentType);
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
        setPreviewType(PreviewHTMLTag.iframe);
      }
    };

    if (previewURL) {
      setOpacity(0);
      setPreviewType(null);
      setLoading(true);
      setShowLoading(false);

      if (loadingDelayRef.current) {
        clearTimeout(loadingDelayRef.current);
      }

      loadingDelayRef.current = setTimeout(() => {
        if (!cancelled && previewURL === currentURL) {
          setShowLoading(true);
        }
      }, 2000);

      detectPreviewType(previewURL)
        .catch((err: unknown) => {
          console.error(err);
        })
        .finally(() => {
          // Only apply result if this effect instance is still current
          if (!cancelled && previewURL === currentURL) {
            setDisplayPreviewURL(previewURL);
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
    // Unmute video when user click on the screen
    if (previewType === PreviewHTMLTag.video && videoRef.current) {
      document.addEventListener('click', unmuteVideo);
    }

    return () => {
      if (previewType === PreviewHTMLTag.video && videoRef.current) {
        document.removeEventListener('click', unmuteVideo);
      }
    };
  }, [previewType, videoRef]);

  const handleIframeLoad = () => {
    console.log('[ArtworkPlayer] Iframe loaded');
    if (isWebGLAvailable()) {
      setShowMessageModal(false);
      loadedSource();
    } else {
      handleWebGLLost();
    }
  };

  const loadedSource = () => {
    setOpacity(1);
    console.log('[ArtworkPlayer] loaded source');
    // When an iframe is present in a page, the parent window might not receive keydown events because the iframe itself captures these events when it is focused.
    // This is work around to focus the parent window.
    // window.focus();
    iframeRef.current?.focus();
    setLoading(false);
    setShowLoading(false);
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = undefined;
    }
  };

  // Video playback handling (after CORS loading)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (previewType !== PreviewHTMLTag.video || !videoElement) {
      return;
    }

    setOpacity(1);

    const handleVideoPlay = () => {
      videoElement
        .play()
        .catch((error: unknown) => {
          console.log('Error play video', error);
          reTryToPlayVideo();
        })
        .finally(() => {
          setLoading(false);
        });
    };

    let hlsInstance: Hls | null = null;

    if (
      isStreaming &&
      Hls.isSupported() &&
      displayPreviewURL.endsWith('.m3u8')
    ) {
      hlsInstance = new Hls({
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferLength: 30,
        liveSyncDuration: 10,
      });

      hlsInstance.attachMedia(videoElement);
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        hlsInstance?.loadSource(
          `${displayPreviewURL}?clientBandwidthHint=${CLIENT_BANDWIDTH_HINT.toString()}`
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

    return () => {
      videoElement.removeEventListener('loadeddata', handleVideoPlay);
      hlsInstance?.destroy();
    };
  }, [previewType, isStreaming, displayPreviewURL]);

  // Universal media loading with CORS handling
  useEffect(() => {
    if (!displayPreviewURL) {
      return;
    }

    let isCancelled = false;
    const abortController = new AbortController();
    const cleanupFns: (() => void)[] = [];

    const loadMedia = async () => {
      if (isCancelled) return;

      const handleMediaError =
        (mediaType: BlobLoadedMediaType) => (error: Error) => {
          console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
          Sentry.captureMessage(`[ArtworkPlayer] ${mediaType} load failed`, {
            level: 'error',
            extra: { displayPreviewURL, mediaType },
          });
        };

      if (previewType === PreviewHTMLTag.image && imageRef.current) {
        const imageElement = imageRef.current;
        imageElement.onload = loadedSource;
        imageElement.onerror = () => {
          handleMediaError('image')(new Error('Image load failed'));
        };
        cleanupFns.push(() => {
          imageElement.onload = null;
          imageElement.onerror = null;
        });

        await mediaLoader.current.loadMedia({
          url: displayPreviewURL,
          mediaType: 'image',
          element: imageElement,
          onLoad: loadedSource,
          onError: handleMediaError('image'),
          signal: abortController.signal,
        });
      } else if (
        previewType === PreviewHTMLTag.video &&
        videoRef.current &&
        !isStreaming // Only load video if not streaming
      ) {
        const videoElement = videoRef.current;
        videoElement.onloadeddata = loadedSource;
        videoElement.onerror = () => {
          handleMediaError('video')(new Error('Video load failed'));
        };
        cleanupFns.push(() => {
          videoElement.onloadeddata = null;
          videoElement.onerror = null;
        });

        console.log('[ArtworkPlayer] loading video', displayPreviewURL);
        await mediaLoader.current.loadMedia({
          url: displayPreviewURL,
          mediaType: 'video',
          element: videoElement,
          onLoad: loadedSource,
          onError: handleMediaError('video'),
          signal: abortController.signal,
        });
      } else if (previewType === PreviewHTMLTag.audio && audioRef.current) {
        const audioElement = audioRef.current;
        audioElement.onloadeddata = loadedSource;
        audioElement.onerror = () => {
          handleMediaError('audio')(new Error('Audio load failed'));
        };
        cleanupFns.push(() => {
          audioElement.onloadeddata = null;
          audioElement.onerror = null;
        });

        await mediaLoader.current.loadMedia({
          url: displayPreviewURL,
          mediaType: 'audio',
          element: audioElement,
          onLoad: loadedSource,
          onError: handleMediaError('audio'),
          signal: abortController.signal,
        });
      }
    };

    void loadMedia();

    return () => {
      isCancelled = true;
      abortController.abort();
      cleanupFns.forEach(cleanup => {
        cleanup();
      });
      mediaLoader.current.cleanup();
    };
  }, [displayPreviewURL, previewType]);
  // ---- End of universal media loading with CORS handling ----

  useEffect(() => {
    if (context.isOnline) {
      if (previewType === PreviewHTMLTag.video && videoRef.current) {
        videoRef.current.play().catch((error: unknown) => {
          console.log(
            '[ArtworkPlayer] Error play video',
            JSON.stringify(error)
          );
          Sentry.captureMessage('[ArtworkPlayer] Error play video');
        });
      }
    } else {
      if (previewType === PreviewHTMLTag.video && videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, [context.isOnline, previewType]);

  useEffect(() => {
    if (
      !displayPreviewURL ||
      !context.deviceRotation?.viewMode ||
      !displaySettings
    ) {
      return;
    }

    console.log(
      '[ArtworkPlayer] displaySettings',
      JSON.stringify(displaySettings)
    );
    // Update URL when settings first load or when scaling changes
    updateSoftwareURL(displaySettings);
  }, [displayPreviewURL, displaySettings, context.deviceRotation?.viewMode]);

  const updateSoftwareURL = (displaySettings: DP1DisplayPreference) => {
    if (
      previewType === PreviewHTMLTag.iframe &&
      !displayPreviewURL.includes('base64')
    ) {
      const displayMode =
        displaySettings.scaling === Scaling.Fill ? 'crop' : 'fit';
      const queryParam = `&display_mode=${displayMode}`;
      const url = new URL(displayPreviewURL);
      url.search += queryParam;
      setDisplaySoftwareURL(url.toString());
    } else {
      setDisplaySoftwareURL(displayPreviewURL);
    }
  };

  const handleLoadIframeError = () => {
    setOpacity(1);
    setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    setShowMessageModal(true);
  };

  const reloadIframe = () => {
    console.log('[ArtworkPlayer] reloadIframe');
    setIframeKey(prevKey => prevKey + 1);
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
    setOpacity(0);
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

  useEffect(() => {
    console.log('[ArtworkPlayer] loading', loading);
  }, [loading]);

  useEffect(() => {
    console.log('[ArtworkPlayer] previewType', previewType);
  }, [previewType]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          backgroundColor: displaySettings?.background ?? '#000000',
          justifyContent: 'center',
          position: 'relative',
          transition: `opacity ${FADE_IN_OUT_DURATION_MS.toString()}ms, padding 0.2s ease`,
          opacity: opacity,
          padding: displaySettings?.margin
            ? getDP1Margin(displaySettings.margin)
            : '0px',
          width: '100vw',
          height: '100vh',
        }}>
        <CursorLayer ref={cursorRef} />
        {(previewType === PreviewHTMLTag.video ||
          previewType === PreviewHTMLTag.audio) &&
          loading &&
          showLoading && <Loading />}
        {displayPreviewURL && previewType === PreviewHTMLTag.image && (
          <div
            style={{
              width: '100%',
              height: '100%',
            }}
            className={isCustomView ? styles.customRendering : ''}>
            <img
              ref={imageRef}
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
        {displayPreviewURL && previewType === PreviewHTMLTag.object && (
          <object
            style={{ width: '100%', height: '100%' }}
            data={displayPreviewURL}
            type="text/html"
            onLoad={loadedSource}>
            Not supported
          </object>
        )}
        {displayPreviewURL && previewType === PreviewHTMLTag.video && (
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: convertScalingToObjectFit(displaySettings?.scaling),
            }}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}
            playsInline
            crossOrigin="anonymous"
            onLoad={loadedSource}></video>
        )}
        {displayPreviewURL && previewType === PreviewHTMLTag.audio && (
          <audio
            ref={audioRef}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.loop ?? true}
            onLoadedData={loadedSource}></audio>
        )}
        {displaySoftwareURL && previewType === PreviewHTMLTag.iframe && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            className={styles.iframe}
            src={displaySoftwareURL}
            onLoad={handleIframeLoad}
            onError={handleLoadIframeError}
            sandbox="allow-same-origin allow-scripts"
            tabIndex={0}></iframe>
        )}
        {displaySoftwareURL && previewType === PreviewHTMLTag.iframePDF && (
          <iframe
            className={styles.iframe}
            src={displaySoftwareURL}
            onLoad={handleIframeLoad}
            onError={handleLoadIframeError}
            tabIndex={0}></iframe>
        )}
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
