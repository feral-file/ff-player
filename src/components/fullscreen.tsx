'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface DocumentElementWithFullscreen extends Element {
  msRequestFullscreen?: () => void;
  mozRequestFullscreen?: () => void;
  webkitRequestFullscreen?: () => void;
}

interface DocumentWithFullscreen extends Document {
  msExitFullscreen?: () => void;
  mozCancelFullScreen?: () => void;
  webkitExitFullscreen?: () => void;
}

export default function FullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullScreenChange
      );
      document.removeEventListener(
        'mozfullscreenchange',
        handleFullScreenChange
      );
      document.removeEventListener(
        'MSFullscreenChange',
        handleFullScreenChange
      );
    };
  }, []);

  const toggleFullScreen = () => {
    if (isFullScreen) {
      const doc = document as DocumentWithFullscreen;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (doc.exitFullscreen) {
        void doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        // Safari
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        // Firefox
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        // IE/Edge
        doc.msExitFullscreen();
      }
    } else {
      const element = document.documentElement as DocumentElementWithFullscreen;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (element.requestFullscreen) {
        void element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        // Safari
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullscreen) {
        // Firefox
        element.mozRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        // IE/Edge
        element.msRequestFullscreen();
      }
    }

    setIsFullScreen(!isFullScreen);
  };

  return (
    <div>
      {!isFullScreen && (
        <Image
          src="/images/full-screen-white.svg"
          alt="fullscreen"
          onClick={toggleFullScreen}
          width={24}
          height={24}
        />
      )}
    </div>
  );
}
