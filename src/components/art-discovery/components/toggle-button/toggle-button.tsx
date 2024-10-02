'use client';

import { clsx } from 'clsx';
import styles from './toggle-styles.module.scss';
export interface Option {
  id: number;
  icon: string;
  label: string;
}

interface ToggleButtonProps {
  options: Option[];
  selectedIndex: number;
  focused?: boolean;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  options,
  selectedIndex,
  focused,
}) => {
  return (
    <div className={clsx(styles.outline, focused && styles.active)}>
      <div className={clsx(styles.toggle)}>
        {options.map((option, index) => (
          <div
            key={index}
            className={clsx(styles.selection, {
              [styles.selected]: index === selectedIndex,
            })}>
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
