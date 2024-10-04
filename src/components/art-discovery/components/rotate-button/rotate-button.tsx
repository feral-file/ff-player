'use client';

import { clsx } from 'clsx';
import styles from './rotate-button-styles.module.scss';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { KeyboardEventKey } from '@/constants';

const RotateButton: React.FC<{
  focused?: boolean;
}> = ({ focused }) => {
  const [rotateAngle, setRotateAngle] = useState(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key as KeyboardEventKey) === KeyboardEventKey.Enter) {
        setRotateAngle(rotateAngle + 90);
      }
    };

    if (focused && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focused, rotateAngle]);

  return (
    <div className={clsx(styles.rotate, focused && styles.active)}>
      <div>
        <Image
          src={`/images/rotate${focused ? '-active.svg' : '-inactive.svg'}`}
          alt="rotate"
          width={32}
          height={32}
          style={{
            transform: `rotate(${(rotateAngle || 0).toString()}deg) `,
            transformOrigin: 'center center',
            transition: 'transform 0.2s',
          }}
        />
        <p>Rotate</p>
      </div>
    </div>
  );
};
export default RotateButton;
