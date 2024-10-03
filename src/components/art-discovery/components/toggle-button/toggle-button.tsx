'use client';

import { clsx } from 'clsx';
import styles from './controls-styles.module.scss';

const ToggleButton = (values: string[], selectedIndex: number) => {
  return (
    <div className={styles.toggle}>
      <div className={styles.header}>
        <img src={'/images/ff-logo.svg'} alt="logo" />
      </div>
      <div className={styles.content}>
        <div className={styles.listSettingItems}>
          <div className={clsx(styles.settingItem, styles.active)}>
            <img
              src={'/images/display-preferences-active.svg'}
              alt="display-preferences"
            />
            <p>Display Preferences</p>
          </div>
          <div className={styles.settingItem}>
            <img
              src={'/images/display-rotation-inactive.svg'}
              alt="display-rotation"
            />
            <p>Display Rotation</p>
          </div>
          <div className={styles.settingItem}>
            <img
              src={'/images/pair-mobile-app-inactive copy.svg'}
              alt="pair-mobile-app"
            />
            <p>Pair Mobile App</p>
          </div>
        </div>
        <div className={styles.settingDetail}>
          <p className={styles.title}>Display Preferences</p>
          <p className={styles.description}>
            Choose how artworks are displayed by default with options like Crop
            to Fill for a full-screen effect or Fit to Screen to preserve the
            original aspect ratio.
            <br></br>You can override these settings for individual artworks in
            their artwork details.
          </p>
          <div className={styles.action}></div>
        </div>
      </div>
    </div>
  );
};
export default ToggleButton;
