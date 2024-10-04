'use client';

import { clsx } from 'clsx';
import styles from './toggle-styles.module.scss';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { KeyboardEventKey } from '@/constants';

export interface Option {
  id: number;
  icon: string;
  label: string;
}

interface ToggleButtonProps {
  options: Option[];
  selectedIndex: number;
  focused?: boolean;
  setSelectedIndex: (index: number) => void;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  options,
  selectedIndex,
  focused,
  setSelectedIndex,
}) => {
  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key as KeyboardEventKey) === KeyboardEventKey.Enter) {
        if (selectedIndexRef.current === options.length - 1) {
          setSelectedIndex(0);
        } else {
          setSelectedIndex(selectedIndexRef.current + 1);
        }
      }
    };

    if (focused && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focused, options.length, setSelectedIndex]);

  return (
    <div className={clsx(styles.toggle, focused && styles.active)}>
      {options.map((option, index) => (
        <div
          key={index}
          className={clsx(styles.selection, {
            [styles.selected]: index === selectedIndex,
          })}>
          {index === selectedIndex && (
            <Image
              src={`/images/${option.icon}.svg`}
              alt={option.icon}
              width={24}
              height={24}
            />
          )}
          {option.label}
        </div>
      ))}
    </div>
  );
};
export default ToggleButton;
