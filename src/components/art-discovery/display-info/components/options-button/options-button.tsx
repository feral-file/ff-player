import clsx from 'clsx';
import styles from './options-button-styles.module.scss';

const OptionsButton: React.FC<{
  focused?: boolean;
  selected?: boolean;
}> = ({ focused, selected }) => {
  return (
    <div
      className={clsx(
        styles.optionsButton,
        focused && styles.focused,
        selected && styles.selected
      )}>
      <p>Options</p>
      <img
        src={`/images/option-icon${selected ? '-selected.svg' : focused ? '-active.svg' : '-inactive.svg'}`}
        alt="option-icon"
        width={47}
        height={45}
        className={styles.icon}
      />
    </div>
  );
};

export default OptionsButton;
