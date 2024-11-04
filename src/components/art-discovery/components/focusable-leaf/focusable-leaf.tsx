'use client';
import {
  useFocusable,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation';
import { clsx } from 'clsx';
import React, { ReactElement } from 'react';

export enum Direction {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

const ACTIVE_DELAY_DURATION = 100;

const FocusableLeaf: React.FC<{
  children: React.ReactNode;
  key: string;
  focusKey: string;
  forceFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  blockDirections?: Direction[];
  onFocus?: () => void;
  onBlur?: () => void;
  onEnterPress?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: () => void;
}> = ({
  children,
  key,
  className,
  style,
  focusKey,
  forceFocus,
  blockDirections,
  onFocus,
  onBlur,
  onEnterPress,
  onClick,
}) => {
  const { ref, focused } = useFocusable({
    focusKey: focusKey,
    forceFocus: forceFocus ?? false,
    onFocus: () => {
      onFocus?.();
    },
    onBlur: () => {
      onBlur?.();
    },
    onEnterPress: () => {
      // Simulate a click event on the element
      if (ref.current && ref.current instanceof HTMLElement) {
        const firstChild = ref.current.firstChild as HTMLElement | null;
        if (firstChild) {
          firstChild.classList.add('active');
          setTimeout(() => {
            firstChild.classList.remove('active');
          }, ACTIVE_DELAY_DURATION);
        }
      }

      setTimeout(() => {
        onEnterPress?.();
      }, ACTIVE_DELAY_DURATION);
    },
    onArrowPress: direction => {
      if (blockDirections?.includes(direction as Direction) ?? false) {
        return false;
      }

      return true;
    },
  });

  // Clone children and pass focused as a prop
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments, @typescript-eslint/no-explicit-any
      return React.cloneElement(child as ReactElement<any>, { focused });
    }
    return child;
  });

  const handleMouseClick = (event?: React.MouseEvent<HTMLDivElement>) => {
    setFocus(focusKey);
    event?.stopPropagation();

    if (onClick) {
      onClick();
    } else {
      onEnterPress?.();
    }
  };

  return (
    <div
      key={key}
      ref={ref}
      style={{ width: 'fit-content', ...style }}
      className={clsx(focused && 'focused', className)}
      onClick={handleMouseClick}>
      {childrenWithProps}
    </div>
  );
};

export default FocusableLeaf;
