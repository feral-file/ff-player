'use client';

import { useState, useEffect, useRef } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
import useWebSocket from '../utils/WebSocketManager';
import DeviceManager from '../utils/DeviceManager';
import { Artwork } from '@/utils/types';
import ArtworkPlayer from './artworkPlayer';
import HomePage from './homePage';
import ArtworkService from '@/utils/ArtworkService';


const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('Unknown Device');
  const { locationID, topicID, castInfo } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );
  const artworkService = useRef(new ArtworkService());
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [castStatus, setCastStatus] = useState<boolean | null>(false);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);

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
      DeviceManager.setName(deviceName);
      const generateBranchLink = async () => {
        const url = await DeviceManager.getOrGenerateBranchLink();
        setBranchLink(url);
      };
      generateBranchLink();
    }
  }, [locationID, topicID]);

  useEffect(() => {

    const fetchArtworks = async () => {
      try {
        const artworks = await artworkService.current.getFeaturedArtworks();
        if (artworks) {
          setArtworks(artworks);
          setCurrentArtwork(artworks[0]);
        }
      } catch (error) {
        console.log('Error fetching artworks:', error);

      }
    };
    fetchArtworks();
  }, []);

  useEffect(() => {
    if (artworks.length > 0) {
      let index = 0;
      const interval = setInterval(() => {
        setCurrentArtwork(artworks[index]);
        index = (index + 1) % artworks.length;
      }, 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [artworks]);

  useEffect(() => {
    if (castInfo) {
      const getNftTokens = async (ids: string[]) => {
        if (!ids.length) {
          return;
        }
        try {
          const data = await artworkService.current.queryTokens(ids);
          if (data) {
            setCastPreviewURL(data.tokens[0].asset.metadata.project.latest.previewURL);
            setCastStatus(true);
          }
        } catch (error) {
          console.log('Error fetching NFT tokens:', error);
        }

      };
      console.log('Cast Info:', castInfo);
      const assetIds = castInfo.artworks.map((artwork: any) => artwork.token.id);
      getNftTokens(assetIds);
    }
  }, [castInfo]);

  if (castStatus) {
    return (
      <div style={{width: '100vw', height: '100vh'}}>
        <ArtworkPlayer previewURL={castPreviewURL!} />
      </div>
    )
  } else {
    return (
      <HomePage
        deviceName={deviceName!}
        branchLink={branchLink!}
        currentArtwork={currentArtwork!}
      />
    );
  }
};

export default Home;
