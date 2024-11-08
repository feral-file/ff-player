import clsx from 'clsx';
import styles from './setting-item-styles.module.scss';
import { SettingOption } from '../../Controls';

interface SettingItemProps {
  option: SettingOption;
  focused?: boolean;
  selected?: boolean;
}

function getSettingOptionIconPath(option: SettingOption) {
  return option.toLowerCase().replaceAll(' ', '-');
}

function getSettingOptionLabel(option: SettingOption) {
  return option.toString();
}

const SettingItem: React.FC<SettingItemProps> = ({
  option,
  focused,
  selected,
}) => {
  const optionLabel = getSettingOptionLabel(option);
  return (
    <div
      className={clsx(
        styles.settingItem,
        ((focused ?? false) || (selected ?? false)) && styles.selected,
        focused && styles.focused
      )}>
      <div
        className={styles.iconWrapper}
        style={{
          background:
            (focused ?? false) || (selected ?? false) ? 'transparent' : '',
        }}>
        <img
          src={`/images/${getSettingOptionIconPath(option)}${(focused ?? false) || (selected ?? false) ? '-active.svg' : '-inactive.svg'}`}
          alt={optionLabel}
          width={23}
          height={23}
        />
      </div>
      <p>{optionLabel}</p>
    </div>
  );
};

export default SettingItem;
