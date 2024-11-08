'use client';

import { clsx } from 'clsx';
import styles from './controls-styles.module.scss';

import FocusableContainer from '../components/focusable-container/focusable-container';
import ToggleButton from '../components/toggle-button/toggle-button';
import FocusableLeaf, {
  Direction,
} from '../components/focusable-leaf/focusable-leaf';
import { useEffect, useState } from 'react';
import RotateButton from '../components/rotate-button/rotate-button';
import PairQRCode from './components/pair-qr-code/pair-qr-code';
import { ArtFraming } from '@/services/AppControls';
import NextDailyTimer from './components/next-daily-timer/next-daily-timer';
import SettingItem from './components/setting-item/setting-item';
import SettingDetail from './components/setting-detail/setting-detail';
import { useAppContext } from '@/context/AppContext';
import { artworkFramingOptions } from '../art-discovery.model';

export enum SettingOption {
  ArtworkFraming = 'Artwork Framing',
  DisplayRotation = 'Display Rotation',
  PairMobileApp = 'Pair Mobile App',
}

export enum ControlFocusableLeafKey {
  FramingToggle = 'framing-toggle',
  RotateButton = 'rotate-button',
  ArtworkFraming = 'artwork-framing',
  DisplayRotation = 'display-rotation',
  PairMobileApp = 'pair-mobile-app',
  ControlsLoseFocus = 'control-lose-focus',
  BackToHideButton = 'back-to-hide-button',
}

function getLeafKey(option: SettingOption): ControlFocusableLeafKey | string {
  switch (option) {
    case SettingOption.ArtworkFraming:
      return ControlFocusableLeafKey.ArtworkFraming;
    case SettingOption.DisplayRotation:
      return ControlFocusableLeafKey.DisplayRotation;
    case SettingOption.PairMobileApp:
      return ControlFocusableLeafKey.PairMobileApp;
    default:
      return '';
  }
}

// Controls overlay, appears on all the art casting screens
const Controls: React.FC<{
  hasFocusedChild?: boolean;
  onHidePopup: () => void;
}> = ({ hasFocusedChild, onHidePopup }) => {
  const [settingOption, setSettingOption] = useState<SettingOption>(
    SettingOption.ArtworkFraming
  );

  const { context } = useAppContext();
  const appControl = context.appControl;
  const [selectedArtFraming, setSelectedArtFraming] = useState<ArtFraming>();
  const [rotateAngle, setRotateAngle] = useState<number>();

  useEffect(() => {
    // Initialize selectedConfig
    if (selectedArtFraming === undefined) {
      setSelectedArtFraming(appControl.frameConfig);
    }
  }, [appControl.frameConfig, selectedArtFraming]);

  function settingDetail() {
    switch (settingOption) {
      case SettingOption.ArtworkFraming: {
        return (
          <FocusableContainer>
            <SettingDetail
              title="Artwork Framing"
              description="Choose how artworks are displayed by default with options like Crop to Fill for a full-screen effect or Fit to Screen to preserve the original aspect ratio.\nYou can override these settings for individual artworks in their artwork details.">
              <FocusableLeaf
                key={ControlFocusableLeafKey.FramingToggle}
                blockDirections={[Direction.Up]}
                focusKey={ControlFocusableLeafKey.FramingToggle}
                onEnterPress={() => {
                  const newIndex =
                    ((selectedArtFraming ?? 0) + 1) %
                    artworkFramingOptions.length;
                  setSelectedArtFraming(newIndex);
                  appControl.setFrameConfig(newIndex);
                  appControl.setIsFrameConfigChanged(true);

                  // Reset the selectedConfig to update data hooks
                  setTimeout(() => {
                    appControl.setIsFrameConfigChanged(false);
                  }, 100);
                }}>
                <ToggleButton
                  options={artworkFramingOptions}
                  selectedIndex={selectedArtFraming as number}></ToggleButton>
              </FocusableLeaf>
            </SettingDetail>
          </FocusableContainer>
        );
      }

      case SettingOption.DisplayRotation: {
        return (
          <FocusableContainer>
            <SettingDetail
              title="Display Rotation"
              description="Easily adjust the orientation of the entire screen.\nWith each tap, the display rotates by 90°, allowing you to find the perfect viewing angle for your setup.">
              <FocusableLeaf
                key={ControlFocusableLeafKey.RotateButton}
                blockDirections={[Direction.Up]}
                focusKey={ControlFocusableLeafKey.RotateButton}
                onEnterPress={() => {
                  const newRotateAngle = ((rotateAngle ?? 0) + 90) % 360;
                  setRotateAngle(newRotateAngle);
                  appControl.setRotated(true);

                  // Reset the rotation after 100ms to update data hooks
                  setTimeout(() => {
                    appControl.setRotated(false);
                  }, 100);
                }}>
                <RotateButton rotateAngle={rotateAngle}></RotateButton>
              </FocusableLeaf>
            </SettingDetail>
          </FocusableContainer>
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
  }

  return (
    <>
      {hasFocusedChild ? (
        <div className={clsx(styles.mainContent, styles.focused)}>
          <div className={styles.header}>
            <div className={styles.logo}>
              <img
                src="/images/ff-logo.svg"
                alt="logo"
                height={28}
                width={100}
              />
              <img
                src="/images/FERAL_FILE.svg"
                alt="logo"
                height={28}
                width={100}
              />
            </div>
          </div>
          <div className={styles.content}>
            <div className={styles.listSettingItems}>
              <FocusableContainer
                initialFocusKey={ControlFocusableLeafKey.ArtworkFraming}>
                {Object.values(SettingOption).map((option, index) => (
                  <FocusableLeaf
                    key={index.toString()}
                    focusKey={getLeafKey(option)}
                    onFocus={() => {
                      setSettingOption(option);
                    }}>
                    <SettingItem
                      option={option}
                      selected={option === settingOption}></SettingItem>
                  </FocusableLeaf>
                ))}
              </FocusableContainer>
            </div>

            <div className={styles.settingDetail}>{settingDetail()}</div>
          </div>
        </div>
      ) : (
        <div className={styles.mainContent}>
          <div className={styles.collapseSetting}>
            <FocusableLeaf
              key={'ControlsLoseFocus'}
              focusKey={'ControlsLoseFocus'}
              style={{ flex: '1' }}>
              <div className={styles.brief}>
                <img
                  src="/images/ff-logo.svg"
                  alt="logo"
                  height={28}
                  width={100}
                  className={styles.logo}
                />
                <svg
                  style={{ width: '2em', height: '1.75em' }}
                  xmlns="http://www.w3.org/2000/svg"
                  width="25"
                  height="25"
                  viewBox="0 0 25 25"
                  fill="none">
                  <path
                    d="M5.98663 9.12506L12.7366 15.8751L19.4866 9.12506"
                    stroke="white"
                    stroke-width="1.5"
                    stroke-linecap="square"
                    stroke-linejoin="round"
                  />
                </svg>
                Next Daily: <NextDailyTimer />
              </div>
            </FocusableLeaf>
            <FocusableLeaf
              key={ControlFocusableLeafKey.BackToHideButton}
              focusKey={ControlFocusableLeafKey.BackToHideButton}
              onClick={onHidePopup}>
              <p className={styles.clickable}>
                Press <span style={{ fontStyle: 'italic' }}>[back]</span> to
                Hide
              </p>
            </FocusableLeaf>
          </div>
        </div>
      )}
    </>
  );
};
export default Controls;
