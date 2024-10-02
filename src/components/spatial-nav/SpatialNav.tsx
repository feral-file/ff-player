import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.scss';
import {
  init,
  useFocusable,
  FocusContext,
  setKeyMap,
} from '@noriginmedia/norigin-spatial-navigation';
import { FlutterKeyEventID, KeyboardEventKey } from '@/constants';

const SpatialNav = () => {
  const { ref, focusKey, focusSelf } = useFocusable({ forceFocus: true });

  useEffect(() => {
    init({
      debug: true,
      visualDebug: true,
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

    const handleKeyDown = (event: KeyboardEvent) => {
      console.log('keydown', event.key, event.keyCode);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusSelf]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={styles.wrapper}>
        <div
          className="button-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            width: '200px',
            margin: '50px auto',
          }}>
          <FocusableButton id="btnA" focusKey={'btnA'}>
            A
          </FocusableButton>
          <FocusableButton id="btnB" focusKey={'btnB'}>
            B
          </FocusableButton>
          <FocusableButton id="btnC" focusKey={'btnC'}>
            C
          </FocusableButton>
          <FocusableButton id="btnD" focusKey={'btnD'}>
            D
          </FocusableButton>
        </div>
      </div>
    </FocusContext.Provider>
  );
};

const FocusableButton: React.FC<{
  id: string;
  focusKey: string;
  children: React.ReactNode;
}> = ({ id, focusKey, children }) => {
  const { ref, focused } = useFocusable();
  const [isPressed, setIsPressed] = useState<boolean>(false);
  const lastEventTime = useRef(0);

  useEffect(() => {
    if (focused) {
      // Handle click/press OK event
      const handleKeyDown = (event: KeyboardEvent) => {
        console.log('focus keydown', event.key);
        const now = Date.now();
        const minInterval = 200; // Minimum interval between events in milliseconds

        if (now - lastEventTime.current > minInterval) {
          lastEventTime.current = now;
          // Toggle QR code when user press Enter
          if ((event.key as KeyboardEventKey) === KeyboardEventKey.Enter) {
            console.log('Pressed Enter to ', focusKey);
            setIsPressed(true);

            setTimeout(() => {
              setIsPressed(false);
            }, 1000);
          }
        }
      };

      const handleClick = (event: MouseEvent) => {
        if (event.target instanceof HTMLElement) {
          console.log('clicked to ', focusKey);
          setIsPressed(true);
          setTimeout(() => {
            setIsPressed(false);
          }, 1000);
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('click', handleClick);
      }

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('click', handleClick);
      };
    }
  }, [focused]);

  return (
    <button
      ref={ref}
      id={id}
      className={`${focused ? styles.focusedButton : styles.buttonStyle} ${isPressed ? styles.blink : ''}`}>
      {children}
    </button>
  );
};

export default SpatialNav;
