'use client';

import { KeyboardEventKey, FlutterKeyEventID } from '@/constants';
import {
  useFocusable,
  init,
  setKeyMap,
  setFocus,
  FocusContext,
} from '@noriginmedia/norigin-spatial-navigation';
import React, { ReactElement } from 'react';
import { useEffect } from 'react';

const FocusableContainer: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  initialFocusKey?: string;
  isFocusBoundary?: boolean;
  autoFocus?: boolean;
}> = ({
  children,
  className,
  style,
  initialFocusKey,
  isFocusBoundary,
  autoFocus,
}) => {
  const { ref, focusKey, hasFocusedChild, focusSelf } = useFocusable({
    forceFocus: true,
    trackChildren: true,
    isFocusBoundary,
    onArrowPress: () => {
      return !isFocusBoundary;
    },
  });

  // Clone children and pass focused as a prop
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments, @typescript-eslint/no-explicit-any
      return React.cloneElement(child as ReactElement<any>, {
        hasFocusedChild: hasFocusedChild,
      });
    }
    return child;
  });

  useEffect(() => {
    init({
      // debug: true,
      // visualDebug: true,
      shouldUseNativeEvents: true,
    });
    setKeyMap({
      left: [37, KeyboardEventKey.ArrowLeft, FlutterKeyEventID.arrowLeft],
      up: [38, KeyboardEventKey.ArrowUp, FlutterKeyEventID.arrowUp],
      right: [39, KeyboardEventKey.ArrowRight, FlutterKeyEventID.arrowRight],
      down: [40, KeyboardEventKey.ArrowDown, FlutterKeyEventID.arrowDown],
      enter: [
        13,
        KeyboardEventKey.Enter,
        FlutterKeyEventID.enter,
        FlutterKeyEventID.select,
      ],
    });
  }, []);

  // Set default focus
  useEffect(() => {
    if (initialFocusKey) {
      setFocus(initialFocusKey);
    }

    if (autoFocus) {
      focusSelf();
    }
  }, [autoFocus, focusSelf, initialFocusKey]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} style={style} className={className}>
        {childrenWithProps}
      </div>
    </FocusContext.Provider>
  );
};
export default FocusableContainer;
