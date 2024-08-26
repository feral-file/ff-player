'use client';

import { AppContext } from '@/context/AppContext';
import { Daily } from '@/models';
import useDailies, { getDelayTime } from '@/services/qrCodePopUpService';
import DeviceManager from '@/utils/DeviceManager';
import Image from 'next/image';
import QRCode from 'qrcode.react';
import { useContext, useEffect, useState } from 'react';

const QrCodePopUp = () => {
  const context = useContext(AppContext);
  const [branchLink, setBranchLink] = useState('');
  const [currentDaily, setCurrentDaily] = useState<Daily>();
  const [nextArtwork, setNextArtwork] = useState<number>(0);
  const [isShowComponent, setIsShowComponent] = useState<boolean>(false);

  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };
  const { locationID, topicID } = context?.websocketData ?? {};

  const dailies = useDailies();

  useEffect(() => {
    if (locationID && topicID) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      const generateBranchLink = async () => {
        try {
          const url = await DeviceManager.getOrGenerateBranchLink();
          if (url) {
            setBranchLink(url);
          }
        } catch (error) {
          console.log(error);
        }
      };
      generateBranchLink().catch((error: unknown) => {
        console.log(error);
      });
    }
  }, [locationID, topicID]);

  useEffect(() => {
    if (dailies.length > 0) {
      setCurrentDaily(dailies[0]);
      const nextArtwork = getDelayTime(dailies) / 3600000;
      setNextArtwork(nextArtwork);
    }
    setIsShowComponent(dailies.length > 0);
  }, [dailies]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        backgroundColor: '#2e2e2e',
        borderRadius: `0 20px 0 0`,
        display: isShowComponent ? 'flex' : 'none',
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
              ? currentDaily.token.asset.metadata.project.latest.artistName +
                ','
              : ''}
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
          alignItems: 'flex-end',
        }}>
        {branchLink ? (
          <QRCode value={branchLink} size={screenRatio * 86}></QRCode>
        ) : (
          <p style={{ width: screenRatio * 86, height: screenRatio * 86 }}>
            Connecting...
          </p>
        )}
        <div style={{ width: screenRatio * 500 }}>
          <p style={{ width: '40%' }}>
            Get the Feral File mobile app to browse 15,000+ original artworks,
            and choose what to display on your TV.
          </p>
        </div>
      </div>
    </div>
  );
};

export default QrCodePopUp;
