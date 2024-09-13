import React, { useState, useEffect } from 'react';

const youtubeFailedThumbnailHeight = 90;

interface QueuingImagesProps {
  urls: string[];
  alt: string;
}

const QueuingImages: React.FC<QueuingImagesProps> = ({ urls, alt }) => {
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (urls.length > 0) {
      setCurrentUrl(urls[0]);
    }
  }, [urls]);

  const handleImageLoading = (
    event: React.SyntheticEvent<HTMLImageElement>
  ) => {
    if (event.currentTarget.naturalHeight <= youtubeFailedThumbnailHeight) {
      if (currentUrlIndex < urls.length - 1) {
        const nextIndex = currentUrlIndex + 1;
        setCurrentUrlIndex(nextIndex);
        setCurrentUrl(urls[nextIndex]);
      } else {
        setCurrentUrl(undefined); // No valid image found
      }
    }
  };

  return (
    <>
      {currentUrl && (
        <div style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={alt}
            onLoad={handleImageLoading}
            width={500}
            height={500}
          />
        </div>
      )}
    </>
  );
};

export default QueuingImages;
