'use client';

import { KeyboardEventKey, FlutterKeyEventID } from '@/constants';
import {
  useFocusable,
  init,
  setKeyMap,
  FocusContext,
} from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';

const FocusContainer: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { ref, focusKey, focusSelf } = useFocusable({ forceFocus: true });

  useEffect(() => {
    init({
      debug: true,
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
    focusSelf();
  }, [focusSelf]);
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>{children}</div>
    </FocusContext.Provider>
  );
};
export default FocusContainer;
