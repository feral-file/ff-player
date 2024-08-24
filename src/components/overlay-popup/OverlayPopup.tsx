'use client';

import { AppContext } from '@/context/AppContext';
import { Daily } from '@/models';
import useDailies, { getDelayTime } from '@/services/qrCodePopUpService';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import Microphone, { MicrophoneState } from '../microphone/Microphone';
import { useRouter } from 'next/navigation';

const OverlayPopup = () => {
  const context = useContext(AppContext);
  const [currentDaily, setCurrentDaily] = useState<Daily>();
  const [nextArtwork, setNextArtwork] = useState<number>(0);

  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };

  const dailies = useDailies();
  const router = useRouter();

  useEffect(() => {
    if (dailies.length > 0) {
      setCurrentDaily(dailies[0]);
      const nextArtwork = getDelayTime(dailies) / 3600000;
      setNextArtwork(nextArtwork);
    }
  }, [dailies]);

  const handleNavigateAIArtwork = () => {
    router.push('/ai-artwork');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        backgroundColor: '#2e2e2e',
        borderRadius: `0 20px 0 0`,
        display: 'flex',
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
              : '--'}
            ,
          </p>
          <p style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
            {currentDaily?.token?.asset.metadata.project.latest.title
              ? currentDaily.token.asset.metadata.project.latest.title
              : '--'}
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: screenRatio * 20,
          alignItems: 'center',
        }}>
        <Microphone
          onClick={handleNavigateAIArtwork}
          state={MicrophoneState.Inactive}
        />
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
