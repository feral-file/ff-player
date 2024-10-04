'use client';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { clsx } from 'clsx';
import React, { ReactElement } from 'react';

const FocusableLeaf: React.FC<{
  children: React.ReactNode;
  id: string;
  focusKey: string;
  onFocus?: () => void;
}> = ({ children, id, focusKey, onFocus }) => {
  const { ref, focused } = useFocusable({
    focusKey: focusKey,
    onFocus: () => {
      onFocus?.();
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

  return (
    <div ref={ref} id={id} className={clsx(focused && 'focused')}>
      {childrenWithProps}
    </div>
  );
};

export default FocusableLeaf;
