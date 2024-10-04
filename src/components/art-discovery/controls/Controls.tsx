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
import RotateButton from '../components/rotate-button/rotate-button';
import PairQRCode from './components/pair-qr-code/pair-qr-code';

const artworkFramingOptions: Option[] = [
  { id: 0, icon: 'fit-to-screen', label: 'Fit to Screen' },
  { id: 1, icon: 'crop-to-fill', label: 'Crop to Fill' },
];

enum SettingOption {
  ArtworkFraming = 'Artwork Framing',
  DisplayRotation = 'Display Rotation',
  PairMobileApp = 'Pair Mobile App',
}

enum ControlFocusableLeafKey {
  FramingToggle = 'framing-toggle',
  RotateButton = 'rotate-button',
  ArtworkFraming = 'Artwork Framing',
  DisplayRotation = 'Display Rotation',
  PairMobileApp = 'Pair Mobile App',
}

// Controls overlay, appears on all the art casting screens
const Controls = () => {
  const [selectedFramingOptionId, setSelectedFramingOptionId] =
    useState<number>(0);
  const [settingOption, setSettingOption] = useState<SettingOption>(
    SettingOption.ArtworkFraming
  );

  const settingDetail = () => {
    switch (settingOption) {
      case SettingOption.ArtworkFraming: {
        return (
          <SettingDetail
            title="Artwork Framing"
            description="Choose how artworks are displayed by default with options like Crop to Fill for a full-screen effect or Fit to Screen to preserve the original aspect ratio. You can override these settings for individual artworks in their artwork details.">
            <FocusableLeaf
              id="framing-toggle"
              focusKey={ControlFocusableLeafKey.FramingToggle}>
              <ToggleButton
                options={artworkFramingOptions}
                selectedIndex={selectedFramingOptionId}
                setSelectedIndex={setSelectedFramingOptionId}></ToggleButton>
            </FocusableLeaf>
          </SettingDetail>
        );
      }

      case SettingOption.DisplayRotation: {
        return (
          <SettingDetail
            title="Display Rotation"
            description="Easily adjust the orientation of the entire screen. \nWith each tap, the display rotates by 90°, allowing you to find the perfect viewing angle for your setup.">
            <FocusableLeaf
              id="rotate-button"
              focusKey={ControlFocusableLeafKey.RotateButton}>
              <RotateButton></RotateButton>
            </FocusableLeaf>
          </SettingDetail>
        );
      }

      case SettingOption.PairMobileApp: {
        return (
          <SettingDetail
            title="Pair Mobile App"
            description="Scan the QR code to explore 15,000+ artworks in the Feral File mobile app. Upgrade to Premium to display any artwork on your TV, including your personal collection.">
            <PairQRCode></PairQRCode>
          </SettingDetail>
        );
      }

      default: {
        return <></>;
      }
    }
  };

  return (
    <div className={styles.mainContent}>
      <div className={styles.header}>
        <Image src="/images/ff-logo.svg" alt="logo" height={28} width={100} />
      </div>
      <div className={styles.content}>
        <div className={styles.listSettingItems}>
          <FocusableContainer
            initialFocusKey={ControlFocusableLeafKey.ArtworkFraming}>
            {Object.values(SettingOption).map((option, index) => (
              <FocusableLeaf
                key={index}
                id={option}
                focusKey={option}
                onFocus={() => {
                  setSettingOption(option);
                }}>
                <SettingItem
                  title={option}
                  iconPath={getSettingOptionIconPath(option)}
                  selected={settingOption === option}></SettingItem>
              </FocusableLeaf>
            ))}
          </FocusableContainer>
        </div>

        <div className={styles.settingDetail}>
          <FocusableContainer>{settingDetail()}</FocusableContainer>
        </div>
      </div>
    </div>
  );
};
export default Controls;

function getSettingOptionIconPath(option: SettingOption) {
  return option.toLowerCase().replaceAll(' ', '-');
}

interface SettingItemProps {
  title: string;
  iconPath: string;
  focused?: boolean;
  selected?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  iconPath,
  focused,
  selected,
}) => {
  return (
    <div
      className={clsx(
        styles.settingItem,
        ((focused ?? false) || (selected ?? false)) && styles.active
      )}>
      <Image
        src={`/images/${iconPath}${(focused ?? false) || (selected ?? false) ? '-active.svg' : '-inactive.svg'}`}
        alt={iconPath}
        width={47}
        height={45}
      />
      <p>{title}</p>
    </div>
  );
};

const SettingDetail: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => {
  return (
    <>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{description}</p>
      <div className={styles.action}>{children}</div>
    </>
  );
};
