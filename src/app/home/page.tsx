'use client';

import React, { useState, useEffect, useRef, useContext } from 'react';
import { Artwork, ViewMode } from '@/utils/types';

import styles from '../../styles/global.module.scss';
import clsx from 'clsx';
import Image from 'next/image';
import ArtworkPlayer from '@/components/ArtworkPlayer';
import QRCode from 'qrcode.react';
import { BrowserInfo, detect } from 'detect-browser';
import ArtworkService from '@/services/ArtworkService';
import DeviceManager from '@/utils/DeviceManager';
import { AppContext } from '@/context/AppContext';

export default function HomePage() {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no context.</p>;
  }

  const { screenRatio, viewMode } = useContext(AppContext)?.deviceRotation ?? {
    screenRatio: 1,
    viewMode: ViewMode.landscape,
  };

  const data = context.data;
  const { locationID, topicID } = data;

  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');

  // Services
  const artworkService = useRef(new ArtworkService());

  // initial setup
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browser = detect() as BrowserInfo;
      if (browser) {
        setDeviceName(`${browser.os} - ${browser.name} ${browser.version}`);
      }
    }

    DeviceManager.getName()
      .then(name => {
        console.log('Device Name:', name);
        setDeviceName(name);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, []);

  // Fetch featured artworks
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const fetchArtworks = async () => {
      try {
        const artworks = await artworkService.current.getFeaturedArtworks();
        if (artworks.length) {
          setCurrentArtwork(artworks[0]);
          let index = 0;
          interval = setInterval(() => {
            setCurrentArtwork(artworks[index]);
            index = (index + 1) % artworks.length;
          }, 60 * 1000);
        }
      } catch (error) {
        console.log('Error fetching artworks:', JSON.stringify(error));
      }
    };

    fetchArtworks();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const formatPreviewURL = (previewURI: string) => {
      if (previewURI.startsWith('https')) {
        return previewURI;
      } else {
        return `${process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL!}/${previewURI}`;
      }
    };

    if (currentArtwork) {
      setPreviewURL(formatPreviewURL(currentArtwork.previewURI));
    }
  }, [currentArtwork]);

  useEffect(() => {
    const formatPreviewURL = (previewURI: string) => {
      if (previewURI.startsWith('https')) {
        return previewURI;
      } else {
        return `${process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL!}/${previewURI}`;
      }
    };
    if (currentArtwork) {
      setPreviewURL(formatPreviewURL(currentArtwork.previewURI));
    }
  }, [currentArtwork]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (locationID && topicID && deviceName) {
      DeviceManager.setLocationId(locationID);
      DeviceManager.setTopicId(topicID);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink();
    }
  }, [locationID, topicID, deviceName]);

  return (
    <>
      {viewMode && (
        <div
          className={clsx(
            viewMode === ViewMode.landscape ? styles.landscape : styles.portrait
          )}>
          <div className={clsx(styles.container)}>
            <div className={clsx(styles.info)}>
              <div className={clsx(styles.top)}>
                <Image
                  src="/feralfile-logo.svg"
                  alt="Feral File Logo"
                  width={288 * screenRatio}
                  height={23 * screenRatio}
                />
                <h1
                  style={{
                    fontSize: 48 * screenRatio,
                    paddingTop: 80 * screenRatio,
                  }}>
                  Display exhibitions and your collection to any screen
                </h1>
                <p
                  style={{
                    fontSize: 22 * screenRatio,
                    paddingTop: 40 * screenRatio,
                  }}>
                  Open the Feral File app on your phone to sync your collection.
                </p>
              </div>
              <div className={clsx(styles.bottom)}>
                <div className={clsx(styles.qrcode)}>
                  <h2
                    style={{
                      fontSize: 22 * screenRatio,
                      fontWeight: 'bold',
                      paddingTop: 40 * screenRatio,
                      paddingBottom:
                        (viewMode === ViewMode.landscape ? 80 : 40) *
                        screenRatio,
                    }}>
                    Display Name: {deviceName}
                  </h2>
                  {branchLink ? (
                    <div
                      style={{
                        padding: 10 * screenRatio,
                        backgroundColor: 'white',
                        width: 'fit-content',
                      }}>
                      <QRCode value={branchLink} size={250 * screenRatio} />
                    </div>
                  ) : (
                    <p>Connecting...</p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: 16 * screenRatio }}>
                    {currentArtwork?.artistAlias}
                  </p>
                  <p
                    style={{
                      fontSize: 16 * screenRatio,
                      fontWeight: 'bold',
                      fontStyle: 'italic',
                    }}>
                    {currentArtwork?.series?.title}
                  </p>
                </div>
              </div>
            </div>
            <div className={clsx(styles.viewer)}>
              <ArtworkPlayer previewURL={previewURL!} keyboardCode={0} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
