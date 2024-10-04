'use client';

import { clsx } from 'clsx';
import styles from './controls-styles.module.scss';

import FocusableContainer from '../components/focusable-container/focusable-container';
import ToggleButton, {
  Option,
} from '../components/toggle-button/toggle-button';
import FocusableLeaf from '../components/focusable-leaf/focusable-leaf';
import Image from 'next/image';
import { useState } from 'react';

const artworkFramingOptions: Option[] = [
  { icon: 'fit-to-screen', label: 'Fit to Screen' },
  { icon: 'crop-to-fill', label: 'Crop to Fill' },
];

// Controls overlay, appears on all the art casting screens
const Controls = () => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  return (
    <div className={styles.mainContent}>
      <div className={styles.header}>
        <Image src="/images/ff-logo.svg" alt="logo" height={28} width={100} />
      </div>
      <div className={styles.content}>
        <div className={styles.listSettingItems}>
          <FocusableContainer>
            <FocusableLeaf
              id="display-preferences"
              focusKey="display-preferences">
              <SettingItem
                title="Display Preferences"
                iconPath="display-preferences"></SettingItem>
            </FocusableLeaf>

            <FocusableLeaf id="display-rotation" focusKey="display-rotation">
              <SettingItem
                title="Display Rotation"
                iconPath="display-rotation"></SettingItem>
            </FocusableLeaf>

            <FocusableLeaf id="pair-mobile-app" focusKey="pair-mobile-app">
              <SettingItem
                title="Pair Mobile App"
                iconPath="pair-mobile-app"></SettingItem>
            </FocusableLeaf>
          </FocusableContainer>
        </div>

        <FocusableContainer>
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
            <FocusableLeaf id="framing-toggle" focusKey="framing-toggle">
              <ToggleButton
                options={artworkFramingOptions}
                selectedIndex={selectedIndex}
                setSelectedIndex={setSelectedIndex}></ToggleButton>
            </FocusableLeaf>
          </div>
        </FocusableContainer>
      </div>
    </div>
  );
};
export default Controls;

const SettingItem: React.FC<{
  title: string;
  iconPath: string;
  focused?: boolean;
}> = ({ title, iconPath, focused }) => {
  return (
    <div className={clsx(styles.settingItem, focused && styles.active)}>
      <Image
        src={`/images/${iconPath}${focused ? '-active.svg' : '-inactive.svg'}`}
        alt={iconPath}
        width={47}
        height={45}
      />
      <p>{title}</p>
    </div>
  );
};
