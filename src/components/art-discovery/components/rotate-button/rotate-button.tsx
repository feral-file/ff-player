'use client';

import { clsx } from 'clsx';
import styles from './rotate-button-styles.module.scss';
const RotateButton: React.FC<{
  focused?: boolean;
  rotateAngle?: number;
}> = ({ focused, rotateAngle }) => {
  return (
    <div className={clsx(styles.outline, focused && styles.active)}>
      <div className={clsx(styles.rotate, focused && styles.active)}>
        <div>
          <img
            src={`/images/rotate${focused ? '-active.svg' : '-inactive.svg'}`}
            alt="rotate"
            width={32}
            height={32}
            style={{
              transform: `rotate(${(rotateAngle ?? 0).toString()}deg) `,
              transformOrigin: 'center center',
              transition: 'transform 0.2s',
            }}
          />
          <p>Rotate</p>
        </div>
      </div>
    </div>
  );
};
export default RotateButton;
