import FocusableLeaf from '@/components/art-discovery/components/focusable-leaf/focusable-leaf';
import clsx from 'clsx';
import styles from './options-drawer-styles.module.scss';
import OptionsButton from '../options-button/options-button';
import { ArtFraming } from '@/services/AppControls';
import { usePopUpContext } from '@/context/PopUpContext';

enum ArtworkSettingOption {
  FitToScreen = 'Fit to Screen',
  CropToFill = 'Crop to Fill',
  Rotate = 'Rotate',
}

export enum OptionsDrawerLeafKey {
  OptionsButton = 'draw-options-button',
}

const OptionsDrawer: React.FC<{
  onClosed?: () => void;
}> = ({ onClosed }) => {
  const { artDisplaySetting, setArtDisplaySetting } = usePopUpContext();

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
        {Object.values(ArtworkSettingOption).map((option, index) => (
          <FocusableLeaf
            key={index.toString()}
            focusKey={'artwork-' + option}
            onEnterPress={() => {
              updateArtDisplaySetting(option);
            }}>
            <OptionItem
              option={option}
              isRotated={option === ArtworkSettingOption.Rotate}
              rotateRadius={artDisplaySetting?.rotateRadius}></OptionItem>
          </FocusableLeaf>
        ))}
      </div>
    </div>
  );
};

export default OptionsDrawer;

interface ArtworkOptionItemProps {
  option: ArtworkSettingOption;
  focused?: boolean;
  isRotated?: boolean;
  rotateRadius?: number;
}

const OptionItem: React.FC<ArtworkOptionItemProps> = ({
  option,
  focused,
  isRotated,
  rotateRadius,
}) => {
  const label = getArtworkSettingOptionLabel(option);
  return (
    <div className={clsx(styles.optionItemOutline, focused && styles.focused)}>
      <style jsx>{`
        .active {
          > div {
            background-color: #b9e5ff;
            padding: 0;
            padding-left: 0.3em;
            padding-right: 1em;
          }
        }
      `}</style>
      <div className={clsx(styles.optionItem)}>
        <div
          className={styles.iconWrapper}
          style={{
            background: (focused ?? false) ? 'transparent' : '#4A4A4A',
          }}>
          <img
            src={`/images/${getArtworkSettingOptionIconPath(option)}${(focused ?? false) ? '-active.svg' : '-inactive.svg'}`}
            alt={label}
            width={47}
            height={45}
            style={
              isRotated
                ? {
                    transform: `rotate(${(rotateRadius ?? 0).toString()}deg) `,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s',
                    width: '1.95em',
                    height: '1.25em',
                  }
                : { width: '1.95em', height: '1.25em' }
            }
          />
        </div>
        <p>{label}</p>
      </div>
    </div>
  );
};

function getArtworkSettingOptionIconPath(option: ArtworkSettingOption) {
  return 'artwork-' + option.toLowerCase().replaceAll(' ', '-');
}

function getArtworkSettingOptionLabel(option: ArtworkSettingOption) {
  return option.toString();
}
