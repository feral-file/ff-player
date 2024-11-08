'use client';

import { QrCodeSkeleton } from '@/components/skeleton/skeleton';
import { useAppContext } from '@/context/AppContext';
import DeviceManager from '@/utils/DeviceManager';
import QRCode from 'qrcode.react';
import { useEffect, useState } from 'react';

const PairQRCode: React.FC = () => {
  const { context } = useAppContext();
  const { screenRatio } = context.deviceRotation ?? {
    screenRatio: 1,
  };
  const { locationID, topicID } = context.websocketData;

  const [branchLink, setBranchLink] = useState('');

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

  return branchLink ? (
    <QRCode
      value={branchLink}
      size={screenRatio * 256}
      bgColor={'transparent'}
      fgColor={'#ffffff'}></QRCode>
  ) : (
    <div style={{ width: screenRatio * 256, height: screenRatio * 256 }}>
      <QrCodeSkeleton />
    </div>
  );
};
export default PairQRCode;
