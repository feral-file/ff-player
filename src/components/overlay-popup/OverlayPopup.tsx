'use client';

import { AppContext } from '@/context/AppContext';
import { Daily } from '@/models';
import useDailies, { getDelayTime } from '@/services/qrCodePopUpService';
import Image from 'next/image';
import { useContext, useEffect, useRef, useState } from 'react';
import Microphone, { MicrophoneState } from '../microphone/Microphone';
import { useRouter } from 'next/navigation';
import {
  AIRecordedKeyCodes,
  KeyCodes,
  KeyDown,
  NavigationKeyCodes,
} from '@/constants';

const OverlayPopup = () => {
  const context = useContext(AppContext);
  const [currentDaily, setCurrentDaily] = useState<Daily>();
  const [nextArtwork, setNextArtwork] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>(
    MicrophoneState.Inactive
  );

  const lastEventTime = useRef(0);

  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };

  const dailies = useDailies();
  const router = useRouter();

  const microphoneStateRef = useRef<MicrophoneState>(MicrophoneState.Inactive);

  // Add event listener for press button 0 to toggle QR code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        if (AIRecordedKeyCodes.includes(event.keyCode as KeyCodes)) {
          if (showQrCode) {
            handleNavigateAIArtwork();
          } else {
            setShowQrCode(!showQrCode);
          }
          return;
        }

        if (NavigationKeyCodes.includes(event.keyCode as KeyCodes)) {
          setMicrophoneState(MicrophoneState.Active);
          microphoneStateRef.current = MicrophoneState.Active;
          return;
        }

        if (KeyCodes.back === (event.keyCode as KeyCodes)) {
          if (showQrCode) {
            setShowQrCode(false);
            return;
          }

          router.back();
          return;
        }

        // Toggle QR code when user press Enter
        if ((event.key as KeyDown) === KeyDown.enter) {
          if (
            showQrCode &&
            microphoneStateRef.current === MicrophoneState.Active
          ) {
            handleNavigateAIArtwork();
          }
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrCode]);

  useEffect(() => {
    if (dailies.length > 0) {
      setCurrentDaily(dailies[0]);
      setShowQrCode(true);
      const nextArtwork = getDelayTime(dailies) / 3600000;
      setNextArtwork(nextArtwork);
    } else {
      setShowQrCode(false);
    }
  }, [dailies]);

  const handleNavigateAIArtwork = () => {
    setShowQrCode(false);
    microphoneStateRef.current = MicrophoneState.Inactive;
    router.push('/ai-artwork');
  };

  useEffect(() => {
    if (showQrCode) {
      const timeoutID = setTimeout(() => {
        setShowQrCode(false);
      }, 10000);

      return () => {
        clearTimeout(timeoutID);
      };
    } else {
      setMicrophoneState(MicrophoneState.Inactive);
    }
  }, [showQrCode]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        backgroundColor: '#2e2e2e',
        borderRadius: `0 20px 0 0`,
        display: showQrCode ? 'flex' : 'none',
        flexDirection: 'column',
        padding: screenRatio * 40,
        gap: screenRatio * 40,
        zIndex: 3,
        fontSize: screenRatio * 14,
        lineHeight: 1.4,
        color: '#ffffff',
      }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: screenRatio * 100,
          width: '100%',
        }}>
        <Image
          src={'/feralfile-logo.svg'}
          alt="FF logo"
          width={screenRatio * 224}
          height={screenRatio * 23}></Image>
      </div>
      <div>
        <div
          style={{
            borderBottom: '1px solid #ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            paddingBottom: screenRatio * 10,
          }}>
          <p>Today’s daily</p>
          <p
            style={{
              color: '#A0A0A0',
            }}>
            Next work: {nextArtwork > 0 ? nextArtwork.toFixed(0) : '--'}hr
          </p>
        </div>
        <div style={{ paddingTop: screenRatio * 15 }}>
          <p>
            {currentDaily?.token?.asset.metadata.project.latest.artistName
              ? currentDaily.token.asset.metadata.project.latest.artistName
              : ''}
            ,
          </p>
          <p style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
            {currentDaily?.token?.asset.metadata.project.latest.title
              ? currentDaily.token.asset.metadata.project.latest.title
              : ''}
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: screenRatio * 20,
          alignItems: 'center',
        }}>
        <Microphone onClick={handleNavigateAIArtwork} state={microphoneState} />
        <div style={{ width: screenRatio * 400 }}>
          <p style={{ width: '40%' }}>
            Find the perfect artwork for any situation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OverlayPopup;
