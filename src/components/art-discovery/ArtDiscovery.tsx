'use client';

import styles from './art-discovery-styles.module.scss';
import Controls from './controls/Controls';
import DisplayInfo from './display-info/Info';
import { usePopUpContext } from '@/context/PopUpContext';
import FocusableContainer from './components/focusable-container/focusable-container';
import { KeyboardEventKey } from '@/constants';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { CastCommand, ViewMode } from '@/utils/types';
import { usePathname } from 'next/navigation';
import { EventEmitter, Event } from '@/utils/EventEmitter';

const ArtDiscovery = () => {
  const { displayInfo } = usePopUpContext();
  const { token, ffArtworkID, dailyNote } = displayInfo ?? {};
  const [isCastingSingleArt, setIsCastingSingleArt] = useState<boolean>(true);
  const [showPopup, setShowPopup] = useState(true);
  const [isInfoExpanded, setInfoExpanded] = useState(false);
  const [isOptionsExpanded, setOptionsExpanded] = useState(false);
  const lastEventTime = useRef(0);
  const { context } = useAppContext();
  const { castInfo } = context.websocketData;
  const { screenRatio } = context.deviceRotation ?? {
    screenRatio: 1,
    viewMode: ViewMode.landscape,
  };
  const [isInDaily, setIsInDaily] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsInDaily(pathname === '/daily');
  }, [pathname]);

  useEffect(() => {
    setIsCastingSingleArt(!!displayInfo);
  }, [displayInfo]);

  useEffect(() => {
    if (castInfo) {
      switch (castInfo.castCommand) {
        case CastCommand.connect:
        case CastCommand.castDaily:
        case CastCommand.castListArtwork:
        case CastCommand.castExhibition: {
          setShowPopup(false);
          break;
        }
      }
    }
  }, [castInfo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        // Press Enter to expand

        switch (event.key as KeyboardEventKey) {
          case KeyboardEventKey.Enter:
            setShowPopup(true);
            break;

          case KeyboardEventKey.Backspace:
            if (showPopup) {
              if (isOptionsExpanded) {
                setOptionsExpanded(false);
              } else {
                if (isInfoExpanded) {
                  setInfoExpanded(false);
                } else {
                  setShowPopup(false);
                }
              }
            } else {
              EventEmitter.emit(Event.escape);
            }

            break;

          default:
            break;
        }
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement) {
        setShowPopup(true);
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
  }, [isInDaily, isInfoExpanded, isOptionsExpanded, showPopup]);

  useEffect(() => {
    updatePlatformBackKeyHandling(showPopup || !isInDaily);
  }, [showPopup, isInDaily]);

  function updatePlatformBackKeyHandling(value: boolean) {
    try {
      console.log('backAbleChanged', value);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).AppState?.postMessage(
        JSON.stringify({
          handler: 'backAbleChanged',
          data: value,
        })
      );
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <>
      {showPopup && (
        <div
          className={styles.container}
          style={{ fontSize: 20 * screenRatio }}>
          {isCastingSingleArt && (
            <FocusableContainer
              autoFocus={true}
              isFocusBoundary={isInfoExpanded}>
              <DisplayInfo
                ffArtworkID={ffArtworkID}
                token={token}
                dailyNote={dailyNote}
                isInfoExpanded={isInfoExpanded}
                onInfoExpandedChanged={setInfoExpanded}
                isOptionsExpanded={isOptionsExpanded}
                onOptionsExpandedChanged={setOptionsExpanded}
              />
            </FocusableContainer>
          )}
          <FocusableContainer>
            <Controls />
          </FocusableContainer>
        </div>
      )}
    </>
  );
};

export default ArtDiscovery;
