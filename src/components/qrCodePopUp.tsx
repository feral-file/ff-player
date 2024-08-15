'use client';

import { AppContext } from '@/context/AppContext';
import DeviceManager from '@/utils/DeviceManager';
import Image from 'next/image';
import QRCode from 'qrcode.react';
import { useContext, useEffect, useState } from 'react';

const QrCodePopUp = () => {
  const context = useContext(AppContext);
  const [branchLink, setBranchLink] = useState('');

  const { screenRatio } = context?.deviceRotation ?? {
    screenRatio: 1,
  };
  const { locationID, topicID } = context?.websocketData ?? {};

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

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        backgroundColor: '#000000',
        borderRadius: `0 20px 0 0`,
        display: 'flex',
        flexDirection: 'column',
        padding: screenRatio * 40,
        gap: screenRatio * 40,
        zIndex: 3,
        fontSize: screenRatio * 14,
        lineHeight: 1.4,
      }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: screenRatio * 200,
          width: '100%s',
        }}>
        <Image
          src={'/feralfile-logo.svg'}
          alt="FF logo"
          width={screenRatio * 224}
          height={screenRatio * 23}></Image>
        <Image
          src={'/close.svg'}
          alt="Close"
          width={screenRatio * 22}
          height={screenRatio * 22}></Image>
      </div>
      <div>
        <div
          style={{
            borderBottom: '1px solid #ffffff',

            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            padding: screenRatio * 10,
          }}>
          <p>Today’s daily</p>
          <p
            style={{
              color: '#A0A0A0',
            }}>
            Next work: 12hr
          </p>
        </div>
        <div style={{ paddingTop: screenRatio * 15 }}>
          <p>john gerrard,</p>
          <p style={{ fontStyle: 'italic', fontWeight: 'bold' }}>
            crystalline work (arctic)
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: screenRatio * 20 }}>
        {branchLink ? (
          <QRCode value={branchLink} size={screenRatio * 86}></QRCode>
        ) : (
          <p>Connecting...</p>
        )}
        <p style={{ maxWidth: '32%' }}>
          Get the Feral File app on your phone to browse and display over 15,000
          artworks on your tv.
        </p>
      </div>
    </div>
  );
};

export default QrCodePopUp;
