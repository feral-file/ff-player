import {
  FileUseAudio,
  FileUseIframe,
  FileUseIframePDF,
  FileUseImage,
  FileUseObject,
  FileUseVideo,
  MessageModalType,
  MIMETypeAudio,
  MIMETypeImage,
  MIMETypeObject,
  MIMETypeUseStream,
  MIMETypeVideo,
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

const ArtworkPlayer = ({
  previewURL,
  artworkID,
  castingType,
  isCustomView,
  backgroundColor = '#000000', // default background color is black
}: {
  previewURL: string;
  artworkID: string;
  castingType?: CastingArtworkType;
  isCustomView?: boolean;
  keyboardCode?: number;
  backgroundColor?: string;
}) => {
  const { context } = useAppContext();
  const { artDisplaySetting, resetArtDisplaySetting } = usePopUpContext();
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

    if (MIMETypeUseStream.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
      setIsStreaming(true);
    } else if (FileUseIframe.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.iframe);
    } else if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
      setPreviewType(SeriesPreviewHTMLTag.object);
    } else if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
    } else if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
      setPreviewType(SeriesPreviewHTMLTag.audio);
    } else if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
      setPreviewType(SeriesPreviewHTMLTag.image);
    } else if (FileUseIframePDF.includes(type)) {
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
      setLoading(true);
      setPreviewType(null);
      detectPreviewType(previewURL).catch((err: unknown) => {
        console.error(err);
      });

      // Reset artDisplaySetting when new artwork is loaded
      resetArtDisplaySetting();
    }
  }, [previewURL]);

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
    console.log('[CAST] loaded source', previewURL);
    // When an iframe is present in a page, the parent window might not receive keydown events because the iframe itself captures these events when it is focused.
    // This is work around to focus the parent window.
    window.focus();
    setLoading(false);
  };

  useEffect(() => {
    if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
      if (isStreaming && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(previewURL);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current
            ?.play()
            .catch((error: unknown) => {
              console.log(error);
            })
            .finally(() => {
              setLoading(false);
            });
        });

        // Play video when it reaches the end (play in loop)
        hls.on(Hls.Events.BUFFER_EOS, () => {
          videoRef.current?.play().catch((error: unknown) => {
            console.log('[CAST] Error play video', JSON.stringify(error));
            Sentry.captureMessage('[CAST] Error play video');
          });
        });
      } else {
        videoRef.current.src = previewURL;
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
  }, [previewType, isStreaming, previewURL]);

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
    if (!artDisplaySetting || !previewURL) {
      return;
    }

    if (previewType === SeriesPreviewHTMLTag.iframe) {
      const displayMode =
        artDisplaySetting.frameConfig === ArtFraming.CropToFill
          ? 'crop'
          : 'fit';
      const queryParam = `&display_mode=${displayMode}`;
      const url = new URL(previewURL);
      url.search += queryParam;
      setDisplaySoftwareURL(url.toString());
    } else {
      setDisplaySoftwareURL(previewURL);
    }
  }, [artDisplaySetting, previewType, previewURL]);

  const handleLoadIframeError = () => {
    setShowMessageModal(true);
  };

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: backgroundColor,
        justifyContent: 'center',
        position: 'relative',
        transform: `rotate(${(artDisplaySetting?.rotateRadius ?? 0).toString()}deg)`,
        transition: 'transform 0.2s',
      }}>
      {(previewType === null || loading) && <Loading />}
      {previewURL && previewType === SeriesPreviewHTMLTag.image && (
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
            src={previewURL}
            alt="Preview"
            onLoad={loadedSource}
          />
        </div>
      )}
      {previewURL && previewType === SeriesPreviewHTMLTag.object && (
        <object
          style={{ width: '100%', height: '100%' }}
          data={previewURL}
          type="text/html"
          onLoad={loadedSource}>
          Not supported
        </object>
      )}
      {previewURL && previewType === SeriesPreviewHTMLTag.video && (
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
          crossOrigin="anonymous"></video>
      )}
      {previewURL && previewType === SeriesPreviewHTMLTag.audio && (
        <audio autoPlay={true} loop={true}>
          <source src={previewURL} onLoadedData={loadedSource}></source>
        </audio>
      )}
      {displaySoftwareURL &&
        (previewType === SeriesPreviewHTMLTag.iframe ||
          previewType === SeriesPreviewHTMLTag.iframePDF) && (
          <iframe
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: backgroundColor,
            }}
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
