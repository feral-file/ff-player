import React, { useState, useEffect } from 'react';

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

  const handleImageError = () => {
    if (currentUrlIndex < urls.length - 1) {
      const nextIndex = currentUrlIndex + 1;
      setCurrentUrlIndex(nextIndex);
      setCurrentUrl(urls[nextIndex]);
    } else {
      setCurrentUrl(undefined); // No valid image found
    }
  };

  return (
    <>
      {currentUrl && (
        <img src={currentUrl} alt={alt} onError={handleImageError} />
      )}
    </>
  );
};

export default QueuingImages;
