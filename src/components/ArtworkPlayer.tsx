import { AppContext } from '@/context/AppContext';
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

const ArtworkPlayer = ({
  previewURL,
}: {
  previewURL: string;
  artworkID?: string;
  artworkName?: string;
  keyboardCode?: number;
}) => {
  const context = useContext(AppContext);
  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };
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

  useEffect(() => {
    const detectPreviewType = async (previewURL: string) => {
      try {
        const url = new URL(previewURL);
        const extendPreviewURL = url.search
          ? `${previewURL}&v=${Date.now().toString()}`
          : `${previewURL}?v=${Date.now().toString()}`;
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
