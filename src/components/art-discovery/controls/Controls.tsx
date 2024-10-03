'use client';

import { clsx } from 'clsx';
import styles from './controls-styles.module.scss';

// Controls overlay, appears on all the art casting screens
const Controls = () => {
  return (
    <div className={styles['main-content']}>
      <div className={clsx(styles.item, styles['short-display-control'])}>
        <div className={styles['left-content']}>
          <img src={'/images/ff-icon.svg'} alt="icon" />
          <img src="" alt="" />
          <p>Next Artwork: 10min</p>
        </div>
        <div>
          <p>Press [back] to Hide</p>
        </div>
      </div>
      <div className={clsx(styles.item, styles['full-display-control'])}>
        <div>
          <img src={'/images/ff-logo.svg'} alt="logo" />
        </div>
        <div>
          <div>
            <div>
              <img src={'/images/display-preferences-white.svg'} alt="" />
              <p>Display Preferences</p>
            </div>
            <div>
              <img src={'/images/display-rotation-white.svg'} alt="" />
              <p>Display Rotation</p>
            </div>
            <div>
              <img src={'/images/pair-mobil-app-white.svg'} alt="" />
              <p>Pair Mobile App</p>
            </div>
          </div>
          <div></div>
        </div>
      </div>
    </div>
  );
};
export default Controls;
