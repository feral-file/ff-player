import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        alt?: string;
        autoplay?: boolean;
        'camera-controls'?: boolean;
        crossorigin?: string;
        exposure?: string | number;
        loading?: string;
        reveal?: string;
        'shadow-intensity'?: string | number;
        src?: string;
      };
    }
  }
}

export {};
