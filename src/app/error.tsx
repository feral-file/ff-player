'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.location.reload();
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <html>
      <body>
        <div style={styles.container}>
          <h2>Error</h2>
          <p>{error.message}</p>
          <p>Page will reload in 5 seconds.</p>
        </div>
      </body>
    </html>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '2rem',
    textAlign: 'center',
    fontFamily: 'sans-serif',
  },
};
