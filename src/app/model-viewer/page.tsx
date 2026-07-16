import type { Metadata } from 'next';
import ModelViewerScreen from '@/components/model-viewer/ModelViewerScreen';

export const metadata: Metadata = {
  title: 'Model Viewer',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ModelViewerPage() {
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <ModelViewerScreen />
    </div>
  );
}
