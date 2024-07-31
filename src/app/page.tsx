'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';
import { detect, BrowserInfo } from 'detect-browser';
import useWebSocket from '../utils/WebSocketManager';
import DeviceManager from '../utils/DeviceManager';
import Image from 'next/image';

const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('Unknown Device');
  const { locationID, topicID } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browser = detect() as BrowserInfo;
      if (browser) {
        setDeviceName(`${browser.os} - ${browser.name} ${browser.version}`);
      }
    }
  }, []);

  useEffect(() => {
    if (locationID && topicID) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink();
    }
  }, [locationID, topicID]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, backgroundColor: '#2C2C2C', color: '#FFFFFF', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <Image src="/feralfile-logo.png" alt="Feral File Logo" width={200} height={50} />
          <h1>Display exhibitions and your collection to any screen</h1>
          <p>Open the Feral File app on your phone to sync your collection.</p>
          <h2>Display Name: {deviceName}</h2>
        </div>
        <div>
          {branchLink ? (
            <div>
              <h2>Scan the QR code to connect:</h2>
              <QRCode value={branchLink} size={256} />
              <p>{branchLink}</p>
            </div>
          ) : (
            <p>Connecting...</p>
          )}
        </div>
        <div>
          <p>Aleksandra Jovanić</p>
          <p>The Space in Between</p>
        </div>
      </div>
      <div style={{ flex: 2, position: 'relative' }}>
        <Image src="/artwork.png" alt="Artwork" layout="fill" objectFit="cover" />
      </div>
    </div>
  );
};

export default Home;
