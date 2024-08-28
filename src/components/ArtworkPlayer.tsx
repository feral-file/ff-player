import { LocalStorageItem } from '@/constants';
import mixpanel, {
  CastArtworkEventProperties,
  CastingArtworkType,
  MixpanelEventName,
  registerSupperProperties,
  trackEvent,
  trackTimeEvent,
} from '@/utils/mixpanel';
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
import Loading from './loading/loading';
import { AppContext } from '@/context/AppContext';

const ArtworkPlayer = ({
  previewURL,
  artworkID,
  artworkName,
  castingType,
}: {
  previewURL: string;
  artworkID?: string;
  artworkName?: string;
  castingType?: CastingArtworkType;
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

  // Mixpanel
  useEffect(() => {
    trackTimeEvent(MixpanelEventName.CastArtworkEventName);

    const cleanup = async () => {
      if (artworkID && castingType) {
        const event: CastArtworkEventProperties = {
          casting_type: castingType,
          token_id: artworkID,
          token_name: artworkName ?? '',
        };
        try {
          await trackEvent(MixpanelEventName.CastArtworkEventName, event);
          if (
            localStorage.getItem(
              LocalStorageItem.doResetMixpanelAfterTracking
            ) === 'true'
          ) {
            localStorage.setItem(
              LocalStorageItem.doResetMixpanelAfterTracking,
              'false'
            );
            mixpanel.reset();
          }

          const newUserID = localStorage.getItem(
            LocalStorageItem.newMixpanelUserID
          );
          if (newUserID) {
            localStorage.setItem(LocalStorageItem.newMixpanelUserID, '');
            await registerSupperProperties();
            mixpanel.identify(newUserID);
          }
        } catch (error: unknown) {
          console.error(error);
        }
      }
    };

    return () => {
      cleanup().catch((error: unknown) => {
        console.error(error);
      });
    };
  }, [castingType, artworkID, artworkName]);

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
          videoRef.current?.addEventListener('ended', () => {
            console.log('Video ended');
            videoRef.current?.play().catch((error: unknown) => {
              console.log('Error play video', error);
            });
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
        <div style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
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
