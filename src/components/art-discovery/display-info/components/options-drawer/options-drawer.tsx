import FocusableLeaf from '@/components/art-discovery/components/focusable-leaf/focusable-leaf';
import clsx from 'clsx';
import styles from './options-drawer-styles.module.scss';
import OptionsButton from '../options-button/options-button';
import { ArtFraming } from '@/services/AppControls';
import { usePopUpContext } from '@/context/PopUpContext';
import { useEffect, useState } from 'react';
import { artworkFramingOptions } from '@/components/art-discovery/art-discovery.model';
import ToggleButton from '@/components/art-discovery/components/toggle-button/toggle-button';
import RotateButton from '@/components/art-discovery/components/rotate-button/rotate-button';

enum ArtworkSettingOption {
  FitToScreen = 'Fit to Screen',
  CropToFill = 'Crop to Fill',
  Rotate = 'Rotate',
}

export enum OptionsDrawerLeafKey {
  OptionsButton = 'draw-options-button',
  ReportProblem = 'report-problem',
}

const OptionsDrawer: React.FC<{
  onClosed?: () => void;
  onReportProblem?: () => void;
}> = ({ onClosed, onReportProblem }) => {
  const { artDisplaySetting, setArtDisplaySetting } = usePopUpContext();
  const [selectedArtFraming, setSelectedArtFraming] = useState<ArtFraming>();

  const updateArtDisplaySetting = (option: ArtworkSettingOption) => {
    if (!artDisplaySetting) {
      return;
    }

    let newSetting = { ...artDisplaySetting };
    switch (option) {
      case ArtworkSettingOption.Rotate:
        newSetting = {
          ...artDisplaySetting,
          rotateRadius: (artDisplaySetting.rotateRadius || 0) + 90,
        };
        setArtDisplaySetting(newSetting);
        break;

      case ArtworkSettingOption.CropToFill:
        newSetting = {
          ...artDisplaySetting,
          frameConfig: ArtFraming.CropToFill,
        };
        setArtDisplaySetting(newSetting);
        break;
      case ArtworkSettingOption.FitToScreen:
        newSetting = {
          ...artDisplaySetting,
          frameConfig: ArtFraming.FitToScreen,
        };
        setArtDisplaySetting(newSetting);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (selectedArtFraming === undefined) {
      setSelectedArtFraming(artDisplaySetting?.frameConfig);
    } else {
      // Update the artDisplaySetting
      const updateOption =
        selectedArtFraming === ArtFraming.FitToScreen
          ? ArtworkSettingOption.FitToScreen
          : ArtworkSettingOption.CropToFill;
      updateArtDisplaySetting(updateOption);
    }
  }, [selectedArtFraming]);

  return (
    <div className={clsx(styles.optionsDrawer)}>
      <FocusableLeaf
        key={OptionsDrawerLeafKey.OptionsButton}
        focusKey={OptionsDrawerLeafKey.OptionsButton}
        className={styles.optionsButtonLeaf}
        onEnterPress={onClosed}>
        <OptionsButton selected={true}></OptionsButton>
      </FocusableLeaf>
      <div className={styles.listOptions}>
        <FocusableLeaf
          key={'Framing'}
          focusKey={'artwork-framing'}
          onEnterPress={() => {
            const newIndex =
              ((selectedArtFraming ?? 0) + 1) % artworkFramingOptions.length;
            setSelectedArtFraming(newIndex);
          }}
          style={{ width: '100%' }}>
          <ToggleButton
            options={artworkFramingOptions}
            selectedIndex={selectedArtFraming as number}
            lightMode={true}></ToggleButton>
        </FocusableLeaf>
        <FocusableLeaf
          key={ArtworkSettingOption.Rotate}
          focusKey={'artwork-' + ArtworkSettingOption.Rotate}
          onEnterPress={() => {
            updateArtDisplaySetting(ArtworkSettingOption.Rotate);
          }}
          style={{ width: '100%' }}>
          <RotateButton
            rotateAngle={artDisplaySetting?.rotateRadius}
            lightMode={true}></RotateButton>
        </FocusableLeaf>
      </div>
      <div className={styles.report}>
        <FocusableLeaf
          key={OptionsDrawerLeafKey.ReportProblem}
          focusKey={OptionsDrawerLeafKey.ReportProblem}
          onEnterPress={onReportProblem}>
          <ReportButton></ReportButton>
        </FocusableLeaf>
      </div>
    </div>
  );
};

export default OptionsDrawer;

const ReportButton: React.FC<{ focused?: boolean }> = ({ focused }) => {
  return (
    <>
      <style jsx>{`
        .active {
          color: #a70000;
        }
      `}</style>
      <p className={clsx(styles.linkBtn, focused && styles.focused)}>
        Report Problem
      </p>
    </>
  );
};
