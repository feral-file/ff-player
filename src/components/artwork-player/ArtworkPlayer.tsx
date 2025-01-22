import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseObject,
  FileUseVideo,
  MessageModalType,
  MIMETypeAudio,
  MIMETypeImage,
  MIMETypeObject,
  MIMETypePdf,
  MIMETypeUseStream as MIMETypeStreamVideo,
  MIMETypeVideo,
  MITETypeIframe,
  SeriesPreviewHTMLTag,
} from '@/utils/types';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import Loading from '../loading/loading';
import { useAppContext } from '@/context/AppContext';
import styles from './styles.module.scss';
import { appendMetricEventToLocalStorage } from '@/services/metric.service';
import { CastingArtworkType, MetricEvent } from '@/models/metric.model';
import { ArtFraming } from '@/services/AppControls';
import { usePopUpContext } from '@/context/PopUpContext';
import MessageModal from '../MessageModal';
import { useTranslations } from 'next-intl';
import { CLIENT_BANDWIDTH_HINT, FADE_IN_OUT_DAILY_MS } from '@/constants';

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
  const { context } = useAppContext();
  const { artDisplaySetting, resetArtDisplaySetting } = usePopUpContext();
  const [opacity, setOpacity] = useState(1);
  const [displayPreviewURL, setDisplayPreviewURL] = useState<string>('');
  const fadeInTimeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [displaySoftwareURL, setDisplaySoftwareURL] =
    useState<string>(previewURL);
  const [loading, setLoading] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const newDayCheckTimeOutID = useRef<
    NodeJS.Timeout | string | number | undefined
  >(undefined);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const t = useTranslations('ArtworkPlayer');

  function compareToGetFileType(type: string) {
    setIsStreaming(false);
    if (!type) {
      return;
    }
    type = type.toLowerCase();

    if (MIMETypeStreamVideo.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
      setIsStreaming(true);
    } else if (MITETypeIframe.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.iframe);
    } else if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
      setPreviewType(SeriesPreviewHTMLTag.object);
    } else if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
    } else if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
      setPreviewType(SeriesPreviewHTMLTag.audio);
    } else if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
      setPreviewType(SeriesPreviewHTMLTag.image);
    } else if (FileUseIframePDF.includes(type) || type.match(MIMETypePdf)) {
      setPreviewType(SeriesPreviewHTMLTag.iframePDF);
    } else {
      setPreviewType(SeriesPreviewHTMLTag.iframe);
    }
  }

  const reTryToPlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch((error: unknown) => {
        console.log('[CAST] Error play video', JSON.stringify(error));
        Sentry.captureMessage('[CAST] Error play video');
      });
    }
  };

  const unmuteVideo = () => {
    if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
      videoRef.current.muted = false;
      document.removeEventListener('click', unmuteVideo);
    }
  };

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

        const url = new URL(previewURL);
        // The second request could be failed, Chrome uses the cached response from the first request, which has no "Access-Control-Allow-Origin" response header.
        // Workaround: Use a dummy "?x-some-key=some-value" query string parameter will convince the browser that the request is different.
        // Ref: https://serverfault.com/questions/856904/chrome-s3-cloudfront-no-access-control-allow-origin-header-on-initial-xhr-req/856948#856948
        const extendPreviewURL = url.search
          ? `${previewURL}&v=${Date.now().toString()}&x-request=xhr`
          : `${previewURL}?v=${Date.now().toString()}&x-request=xhr`;
        const response = await fetch(extendPreviewURL, {
          method: 'HEAD',
        });
        const contentType = response.headers.get('Content-Type');
        compareToGetFileType(contentType ?? '');
        console.log('[CAST] Content-Type:', contentType);
        Sentry.addBreadcrumb({
          category: 'ArtworkPlayer',
          message: 'play artwork',
          data: { previewURL, contentType },
        });
      } catch (error) {
        console.log('[CAST] Error get content-type', JSON.stringify(error));
        Sentry.captureException(error);
        setPreviewType(SeriesPreviewHTMLTag.iframe);
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

      const FADE_IN_BUFFER_MS = 50;
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
    if (artworkID) {
      setLoading(true);
      // Reset artDisplaySetting when new artwork is loaded
      resetArtDisplaySetting();
    }
  }, [artworkID]);

  useEffect(() => {
    // Unmute video when user click on the screen
    if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
      document.addEventListener('click', unmuteVideo);
    }

    return () => {
      if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
        document.removeEventListener('click', unmuteVideo);
      }
    };
  }, [previewType, videoRef]);

  const loadedSource = () => {
    setOpacity(1);
    console.log('[CAST] loaded source', displayPreviewURL);
    // When an iframe is present in a page, the parent window might not receive keydown events because the iframe itself captures these events when it is focused.
    // This is work around to focus the parent window.
    window.focus();
    setLoading(false);
  };

  useEffect(() => {
    if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
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
    if (context.isOnline && !context.websocketData.isDisconnected) {
      if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
        videoRef.current.play().catch((error: unknown) => {
          console.log('[CAST] Error play video', JSON.stringify(error));
          Sentry.captureMessage('[CAST] Error play video');
        });
      }
    } else {
      if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, [context, previewType]);

  useEffect(() => {
    if (!artDisplaySetting || !displayPreviewURL) {
      return;
    }

    if (previewType === SeriesPreviewHTMLTag.iframe) {
      const displayMode =
        artDisplaySetting.frameConfig === ArtFraming.CropToFill
          ? 'crop'
          : 'fit';
      const queryParam = `&display_mode=${displayMode}`;
      const url = new URL(displayPreviewURL);
      url.search += queryParam;
      setDisplaySoftwareURL(url.toString());
    } else {
      setDisplaySoftwareURL(displayPreviewURL);
    }
  }, [artDisplaySetting, previewType, displayPreviewURL]);

  const handleLoadIframeError = () => {
    setOpacity(1);
    setShowMessageModal(true);
  };

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        justifyContent: 'center',
        position: 'relative',
        transform: `rotate(${(artDisplaySetting?.rotateRadius ?? 0).toString()}deg)`,
        transition: `transform 0.2s, opacity ${FADE_IN_OUT_DAILY_MS.toString()}ms`,
        opacity: opacity,
      }}>
      {(previewType === null || loading) && <Loading />}
      {displayPreviewURL && previewType === SeriesPreviewHTMLTag.image && (
        <div
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          className={isCustomView ? styles.customRendering : ''}>
          <img
            style={{
              width: '100%',
              height: '100%',
              objectFit:
                artDisplaySetting?.frameConfig === ArtFraming.FitToScreen
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
      {displayPreviewURL && previewType === SeriesPreviewHTMLTag.object && (
        <object
          style={{ width: '100%', height: '100%' }}
          data={displayPreviewURL}
          type="text/html"
          onLoad={loadedSource}>
          Not supported
        </object>
      )}
      {displayPreviewURL && previewType === SeriesPreviewHTMLTag.video && (
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit:
              artDisplaySetting?.frameConfig === ArtFraming.FitToScreen
                ? 'contain'
                : 'cover',
          }}
          autoPlay
          loop
          playsInline
          crossOrigin="anonymous"
          onLoad={loadedSource}></video>
      )}
      {displayPreviewURL && previewType === SeriesPreviewHTMLTag.audio && (
        <audio autoPlay={true} loop={true}>
          <source src={displayPreviewURL} onLoadedData={loadedSource}></source>
        </audio>
      )}
      {displaySoftwareURL &&
        (previewType === SeriesPreviewHTMLTag.iframe ||
          previewType === SeriesPreviewHTMLTag.iframePDF) && (
          <iframe
            style={{ width: '100%', height: '100%' }}
            src={displaySoftwareURL}
            onLoad={loadedSource}
            onError={handleLoadIframeError}
            sandbox="allow-same-origin allow-scripts"></iframe>
        )}
      {showMessageModal && (
        <MessageModal
          screenRatio={1}
          message={t('wrong_artwork')}
          messageModalType={MessageModalType.error}
        />
      )}
    </div>
  );
};

export default ArtworkPlayer;
