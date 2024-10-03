'use client';

import { clsx } from 'clsx';
import styles from './controls-styles.module.scss';

import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import FocusContainer from '../components/focus-container/focus-container';

// Controls overlay, appears on all the art casting screens
const Controls = () => {
  return (
    <div className={styles.mainContent}>
      <div className={styles.header}>
        <img src={'/images/ff-logo.svg'} alt="logo" />
      </div>
      <div className={styles.content}>
        <FocusContainer>
          <div className={styles.listSettingItems}>
            <SettingItem
              title="Display Preferences"
              iconPath="display-preferences"
              id="display-preferences"
              focusKey="display-preferences"></SettingItem>
            <SettingItem
              title="Display Rotation"
              iconPath="display-rotation"
              id="display-rotation"
              focusKey="display-rotation"></SettingItem>
            <SettingItem
              title="Pair Mobile App"
              iconPath="pair-mobile-app"
              id="pair-mobile-app"
              focusKey="pair-mobile-app"></SettingItem>
          </div>
        </FocusContainer>

        <FocusContainer>
          <div className={styles.settingDetail}>
            <p className={styles.title}>Display Preferences</p>
            <p className={styles.description}>
              Choose how artworks are displayed by default with options like
              Crop to Fill for a full-screen effect or Fit to Screen to preserve
              the original aspect ratio.
              <br></br>You can override these settings for individual artworks
              in their artwork details.
            </p>
            <div className={styles.action}></div>
            <SettingItem
              title="Pair Mobile App"
              iconPath="pair-mobile-app"
              id="pair-mobile-app"
              focusKey="pair-mobile-app"></SettingItem>
          </div>
        </FocusContainer>
      </div>
    </div>
  );
};
export default Controls;

const SettingItem: React.FC<{
  title: string;
  iconPath: string;
  id: string;
  focusKey: string;
}> = ({ title, iconPath, id, focusKey }) => {
  const { ref, focused } = useFocusable();
  return (
    <div
      ref={ref}
      id={id}
      className={clsx(styles.settingItem, focused && styles.active)}>
      <img
        src={
          '/images/' + iconPath + (focused ? '-active.svg' : '-inactive.svg')
        }
        alt={iconPath}
      />
      <p>{title}</p>
    </div>
  );
};
