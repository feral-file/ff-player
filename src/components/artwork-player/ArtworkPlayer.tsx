import { ArtFraming, MessageModalType } from '@/models';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import Loading from '../loading/loading';
import { useAppContext } from '@/context/AppContext';
import styles from './styles.module.scss';
import { appendMetricEventToLocalStorage } from '@/services/metric.service';
import { CastingArtworkType, MetricEvent } from '@/models/metric.model';
import MessageModal from '../MessageModal';
import { CLIENT_BANDWIDTH_HINT } from '@/constants';
import {
  TokenDisplaySettingWithChanged,
  useArtworkSettings,
} from '@/services/custom-hooks/useArtworkSettings';
import { DisplaySettings } from '@/models/display_settings.model';
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
import { getContentTypeFromURL } from '@/utils/helper';
import CursorLayer, { CursorLayerHandle } from '../CursorLayer';

const MAX_RECOVERY_TIME = 60000 * 10;

const ArtworkPlayer = ({
  previewURL,
  artworkID,
  castingType,
  isCustomView,
  artworkPreviewMIMEType,
}: {
  previewURL: string;
  artworkID: string;
  castingType?: CastingArtworkType;
  isCustomView?: boolean;
  keyboardCode?: number;
  artworkPreviewMIMEType?: string;
}) => {
  const FADE_IN_BUFFER_MS = 50;
  const FADE_IN_OUT_DAILY_MS = 350;
  const { context } = useAppContext();
  const [opacity, setOpacity] = useState(1);
  const [displayPreviewURL, setDisplayPreviewURL] = useState<string>('');
  const fadeInTimeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [displaySoftwareURL, setDisplaySoftwareURL] =
    useState<string>(previewURL);
  const [loading, setLoading] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const newDayCheckTimeOutID = useRef<
    NodeJS.Timeout | string | number | undefined
  >(undefined);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [messageModalText, setMessageModalText] = useState<string | null>(null);
  const [messageModalTitle, setMessageModalTitle] = useState<string | null>(
    null
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const webGLRecoveryIntervalRef = useRef<NodeJS.Timeout>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWebGLContextLost = useRef<boolean>(false);
  const { loadingSettings, displaySettings } = useArtworkSettings(artworkID);

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

  // Metric
  useEffect(() => {
    if (castingType && artworkID) {
      const handleMetric = () => {
        if (newDayCheckTimeOutID.current) {
          clearTimeout(newDayCheckTimeOutID.current as number);
        }

        const event: MetricEvent = {
          event: castingType,
          timestamp: new Date().toISOString(),
          parameters: {
            tokenID: artworkID,
          },
        };

        const checkNewDay = () => {
          const now = new Date();
          const newDay = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1
          );
          newDay.setHours(0, 0, 0, 0);
          const delay = newDay.getTime() - now.getTime();
          newDayCheckTimeOutID.current = setTimeout(() => {
            console.log('[METRIC]: New day');
            handleMetric();
          }, delay);
        };

        appendMetricEventToLocalStorage(event);
        checkNewDay();
      };

      handleMetric();

      return () => {
        if (newDayCheckTimeOutID.current) {
          clearTimeout(newDayCheckTimeOutID.current as number);
        }
      };
    }
  }, [castingType, artworkID]);

  useEffect(() => {
    const detectPreviewType = async (previewURL: string) => {
      console.log('[ArtworkPlayer] detectPreviewType', previewURL);
      try {
        if (artworkPreviewMIMEType) {
          compareToGetFileType(artworkPreviewMIMEType);
          console.log(
            '[CAST] Artwork previewMIMEType:',
            artworkPreviewMIMEType
          );
          Sentry.addBreadcrumb({
            category: 'ArtworkPlayer',
            message: 'play artwork',
            data: { previewURL, artworkPreviewMIMEType },
          });
          return;
        }

        const contentType = await getContentTypeFromURL(previewURL);
        compareToGetFileType(contentType);
        console.log('[ArtworkPlayer] Content-Type:', contentType);
        Sentry.addBreadcrumb({
          category: 'ArtworkPlayer',
          message: 'play artwork',
          data: { previewURL, contentType },
        });
      } catch (error) {
        console.log(
          '[ArtworkPlayer] Error detect preview type',
          JSON.stringify(error)
        );
        Sentry.captureException(error);
        setPreviewType(PreviewHTMLTag.iframe);
      }
    };

    if (previewURL) {
      if (fadeInTimeoutRef.current) {
        clearTimeout(fadeInTimeoutRef.current);
      }

      setOpacity(0);
      setPreviewType(null);
      detectPreviewType(previewURL).catch((err: unknown) => {
        console.error(err);
      });

      fadeInTimeoutRef.current = setTimeout(() => {
        setDisplayPreviewURL(previewURL);
      }, FADE_IN_OUT_DAILY_MS + FADE_IN_BUFFER_MS);
    }

    return () => {
      if (fadeInTimeoutRef.current) {
        clearTimeout(fadeInTimeoutRef.current);
      }
    };
  }, [previewURL]);

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
    console.log('[ArtworkPlayer] loaded source', displayPreviewURL);
    // When an iframe is present in a page, the parent window might not receive keydown events because the iframe itself captures these events when it is focused.
    // This is work around to focus the parent window.
    // window.focus();
    iframeRef.current?.focus();
    setLoading(false);
  };

  useEffect(() => {
    if (previewType === PreviewHTMLTag.video && videoRef.current) {
      setOpacity(1);
      if (
        isStreaming &&
        Hls.isSupported() &&
        displayPreviewURL.endsWith('.m3u8')
      ) {
        const hls = new Hls({
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferLength: 30,
          liveSyncDuration: 10,
        });

        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(
            `${displayPreviewURL}?clientBandwidthHint=${CLIENT_BANDWIDTH_HINT.toString()}`
          );
          videoRef.current
            ?.play()
            .catch((error: unknown) => {
              console.log('Error play video', error);
            })
            .finally(() => {
              setLoading(false);
            });
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
                console.log('Buffer stall detected, attempting to recover...');
                hls.recoverMediaError();
              }
              break;
            default:
              console.error('An unrecoverable error occurred');
              hls.destroy();
              break;
          }
        });
      } else {
        videoRef.current.src = displayPreviewURL;
        videoRef.current.addEventListener('loadeddata', () => {
          videoRef.current
            ?.play()
            .catch(() => {
              reTryToPlayVideo();
            })
            .finally(() => {
              setLoading(false);
            });
        });
      }
    }
  }, [previewType, isStreaming, displayPreviewURL]);

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
      !displaySettings ||
      !context.deviceRotation?.viewMode
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

  const updateSoftwareURL = (
    displaySettings: TokenDisplaySettingWithChanged
  ) => {
    if (previewType === PreviewHTMLTag.iframe) {
      const displayMode =
        (displaySettings.scaling ?? DisplaySettings.defaultScaling) ===
        ArtFraming.CropToFill
          ? 'crop'
          : 'fit';
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
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
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

  return (
    <>
      <div
        style={{
          display: 'flex',
          backgroundColor: displaySettings?.backgroundColor ?? '#000000',
          justifyContent: 'center',
          position: 'relative',
          transition: `opacity ${FADE_IN_OUT_DAILY_MS.toString()}ms, padding 0.2s ease`,
          opacity: opacity,
          padding:
            (displaySettings?.scaling ?? DisplaySettings.defaultScaling) ===
            ArtFraming.FitToScreen
              ? `${String((displaySettings?.marginTop ?? 0) * 100)}vh ${String((displaySettings?.marginRight ?? 0) * 100)}vw ${String((displaySettings?.marginBottom ?? 0) * 100)}vh ${String((displaySettings?.marginLeft ?? 0) * 100)}vw`
              : '0',
          width: '100vw',
          height: '100vh',
        }}>
        <CursorLayer ref={cursorRef} />
        <p
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'red',
            color: 'white',
          }}>
          previewType: {previewType} loading: {loading.toString()}
          loadingSettings: {JSON.stringify(loadingSettings)}
        </p>
        {(previewType === null || loading || loadingSettings) && <Loading />}
        {displayPreviewURL && previewType === PreviewHTMLTag.image && (
          <div
            style={{
              width: '100%',
              height: '100%',
            }}
            className={isCustomView ? styles.customRendering : ''}>
            <img
              style={{
                width: '100%',
                height: '100%',
                objectFit:
                  (displaySettings?.scaling ??
                    DisplaySettings.defaultScaling) === ArtFraming.FitToScreen
                    ? 'contain'
                    : 'cover',
              }}
              className={styles.image}
              src={displayPreviewURL}
              alt="Preview"
              onLoad={loadedSource}
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
              objectFit:
                (displaySettings?.scaling ?? DisplaySettings.defaultScaling) ===
                ArtFraming.FitToScreen
                  ? 'contain'
                  : 'cover',
            }}
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.looping ?? true}
            playsInline
            crossOrigin="anonymous"
            onLoad={loadedSource}></video>
        )}
        {displayPreviewURL && previewType === PreviewHTMLTag.audio && (
          <audio
            autoPlay={displaySettings?.autoPlay ?? true}
            loop={displaySettings?.looping ?? true}>
            <source
              src={displayPreviewURL}
              onLoadedData={loadedSource}></source>
          </audio>
        )}
        {displaySoftwareURL &&
          (previewType === PreviewHTMLTag.iframe ||
            previewType === PreviewHTMLTag.iframePDF) && (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              style={{ width: '100%', height: '100%' }}
              src={displaySoftwareURL}
              onLoad={handleIframeLoad}
              onError={handleLoadIframeError}
              sandbox="allow-same-origin allow-scripts"
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
