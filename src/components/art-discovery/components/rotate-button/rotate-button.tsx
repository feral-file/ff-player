'use client';

import { clsx } from 'clsx';
import styles from './rotate-button-styles.module.scss';
import Image from 'next/image';
import { useEffect } from 'react';
import { KeyboardEventKey } from '@/constants';

const RotateButton: React.FC<{
  focused?: boolean;
}> = ({ focused }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key as KeyboardEventKey) === KeyboardEventKey.Enter) {
        console.log('Pressed Enter');
      }
    };

    if (focused && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focused]);

  return (
    <div className={clsx(styles.rotate, focused && styles.active)}>
      <div>
        <Image src={`/images/rotate.svg`} alt="rotate" width={32} height={32} />
        <p>Rotate</p>
      </div>
    </div>
  );
};
export default RotateButton;
