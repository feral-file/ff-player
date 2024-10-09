'use client';

import { clsx } from 'clsx';
import styles from './toggle-styles.module.scss';
import { ToggleOption } from '../../art-discovery.model';

interface ToggleButtonProps {
  options: ToggleOption[];
  selectedIndex: number;
  focused?: boolean;
  lightMode?: boolean;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  options,
  selectedIndex,
  focused,
  lightMode,
}) => {
  return (
    <div
      className={clsx(
        styles.outline,
        focused && styles.focused,
        lightMode && styles.lightMode
      )}>
      <div className={clsx(styles.toggle)}>
        {options.map((option, index) => (
          <div
            key={index}
            className={clsx(
              styles.selection,
              {
                [styles.selected]: index === selectedIndex,
              },
              focused && styles.focused
            )}>
            {index === selectedIndex && (
              <img
                src={`/images/${option.icon}.svg`}
                alt={option.icon}
                width={24}
                height={24}
                className={styles.icon}
              />
            )}
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
};
export default ToggleButton;
