import clsx from 'clsx';
import styles from './options-button-styles.module.scss';
import { se } from 'date-fns/locale';

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
      {selected ? (
        <img
          src={'/images/option-icon-selected.svg'}
          alt="option-icon"
          width={47}
          height={45}
          className={styles.icon}
        />
      ) : (
        <svg
          className={clsx(styles.arrowDown, focused && styles.focused)}
          width="48"
          height="45"
          viewBox="0 0 48 45"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <rect
            className={styles.arrowBackground}
            x="0.956055"
            y="-4.57764e-05"
            width="47.0056"
            height="45"
            rx="22.5"
            fill="#4A4A4A"
          />
          <path
            d="M33.459 18L24.459 27L15.459 18"
            stroke="white"
            stroke-width="1.5"
            stroke-miterlimit="10"
          />
        </svg>
      )}
    </div>
  );
};

export default OptionsButton;
