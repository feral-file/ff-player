import { useEffect, useState } from 'react';

const useLoadScript = (src: string) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    script.onload = () => {
      setIsLoaded(true);
    };

    script.onerror = () => {
      console.error(`Failed to load the script: ${src}`);
    };

    document.body.appendChild(script);

    // Cleanup: Remove script when the component unmounts or src changes
    return () => {
      document.body.removeChild(script);
    };
  }, [src]);

  return isLoaded;
};

export default useLoadScript;
