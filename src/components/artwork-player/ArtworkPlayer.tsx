import {
  FileUseAudio,
  FileUseIframe,
  FileUseIframePDF,
  FileUseImage,
  FileUseObject,
  FileUseVideo,
  MIMETypeAudio,
  MIMETypeImage,
  MIMETypeObject,
  MIMETypeUseStream,
  MIMETypeVideo,
  SeriesPreviewHTMLTag,
} from '@/utils/types';
import Hls from 'hls.js';
import Image from 'next/image';
import { useContext, useEffect, useRef, useState } from 'react';
import Loading from '../loading/loading';
import { AppContext } from '@/context/AppContext';
import styles from './styles.module.scss';
import { appendMetricEventToLocalStorage } from '@/services/metric.service';
import { CastingArtworkType, MetricEvent } from '@/models/metric.model';

const ArtworkPlayer = ({
  previewURL,
  artworkID,
  castingType,
  isCustomView,
}: {
  previewURL: string;
  artworkID?: string;
  castingType?: CastingArtworkType;
  isCustomView?: boolean;
  keyboardCode?: number;
}) => {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const [previewType, setPreviewType] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const newDayCheckTimeOutID = useRef<
    NodeJS.Timeout | string | number | undefined
  >(undefined);

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

  // Metric
  useEffect(() => {
    if (castingType && artworkID) {
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
          console.log('METRIC: New day');
          appendMetricEventToLocalStorage(event);
        }, delay);
      };

      appendMetricEventToLocalStorage(event);
      checkNewDay();

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
        console.log('Content-Type:', contentType);
      } catch (error) {
        console.log('Error get content-type', error);
        setPreviewType(SeriesPreviewHTMLTag.iframe);
      }
    };

    if (previewURL) {
      setLoading(true);
      setPreviewType(null);
      detectPreviewType(previewURL).catch((err: unknown) => {
        console.error(err);
      });
    }
  }, [previewURL]);

  const loadedSource = () => {
    console.log('loaded source');
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
            console.log('Error play video', error);
          });
        });
      } else {
        videoRef.current.src = previewURL;
        videoRef.current.addEventListener('loadeddata', () => {
          videoRef.current
            ?.play()
            .catch((error: unknown) => {
              console.log('Error play video', error);
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
          console.log('Error play video', error);
        });
      }
    } else {
      if (previewType === SeriesPreviewHTMLTag.video && videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, [context, previewType]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        justifyContent: 'center',
        position: 'relative',
      }}>
      {(previewType === null || loading) && <Loading />}
      {previewURL && previewType === SeriesPreviewHTMLTag.image && (
        <div
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          className={isCustomView ? styles.customRendering : ''}>
          <Image
            src={previewURL}
            alt="Preview"
            layout="fill"
            objectFit="contain"
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
          style={{ width: '100%', height: '100%' }}
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
      {previewURL &&
        (previewType === SeriesPreviewHTMLTag.iframe ||
          previewType === SeriesPreviewHTMLTag.iframePDF) && (
          <iframe
            style={{ width: '100%', height: '100%' }}
            src={previewURL}
            onLoad={loadedSource}
            sandbox="allow-same-origin allow-scripts"></iframe>
        )}
    </div>
  );
};

export default ArtworkPlayer;
