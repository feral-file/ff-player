"use client";

import { useState, useEffect, useRef } from 'react';
import { detect, BrowserInfo } from 'detect-browser';
import useWebSocket from '../utils/WebSocketManager';
import DeviceManager from '../utils/DeviceManager';
import {
  Artwork,
  CastCommand,
  PlayArtworkV2,
  PlaylistToken,
} from "@/utils/types";
import ArtworkPlayer from "./artworkPlayer";
import HomePage from "./homePage";
import OnboardingPage from './onboardingPage';
import ArtworkService from "@/utils/ArtworkService";
import { getIndex } from "@/utils/Playlist";
import ComingSoonPage from './commingSoonPage';

const STANDARD_HEIGHT = 1080;

const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>("Unknown Device");
  const { locationID, topicID, castInfo } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );
  const artworkService = useRef(new ArtworkService());
  const [screenRatio, setScreenRatio] = useState<number>(1);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [castStatus, setCastStatus] = useState<boolean | null>(false);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [displayComingSoon, setDisplayComingSoon] = useState<boolean>(false);


  useEffect(() => {
    if (typeof window !== "undefined") {
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
    if (typeof window !== 'undefined') {
      const resizeHandler = () => {
        const height = window.innerHeight;
        const ratio = height / STANDARD_HEIGHT;
        setScreenRatio(ratio);
      };

      resizeHandler();

    }
  })

  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        const artworks = await artworkService.current.getFeaturedArtworks();
        if (artworks) {
          setArtworks(artworks);
          setCurrentArtwork(artworks[0]);
        }
      } catch (error) {
        console.log("Error fetching artworks:", error);
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
      switch (castInfo.castCommand) {
        case CastCommand.castListArtwork: {
          setDisplayComingSoon(false); // Temporary display coming soon
          const getNftTokens = async (ids: string[]) => {
            if (!ids.length) {
              return;
            }
            try {
              const data = await artworkService.current.queryTokens(ids);
              const artworks = castInfo?.artworks;
              if (!artworks) {
                return;
              }

              if (data) {
                const previewData: Map<string, string> = new Map();
                data.tokens.forEach((token: any) => {
                  previewData.set(
                    token.indexID,
                    token.asset.metadata.project.latest.previewURL
                  );
                });
                const updatedArtworks = artworks.map((artwork: any) => {
                  return {
                    ...artwork,
                    previewURL: previewData.get(artwork.token.id),
                  };
                });
                setPlaylist(updatedArtworks);
                if (castInfo.startTime) {
                  setStartTime(castInfo.startTime);
                  const i = getIndex(updatedArtworks, castInfo?.startTime);
                  setCurrentIndex(i);
                }
              }
            } catch (error) {
              console.log("Error fetching NFT tokens:", error);
            }
          };
          console.log("Cast Info:", castInfo);
          if (castInfo.artworks) {
            const assetIds = castInfo.artworks.map(
              (artwork: any) => artwork.token.id
            );
            getNftTokens(assetIds);
          }
        }

        default: {
          // Temporary display coming soon
          setDisplayComingSoon(true);
          setTimeout(() => {
            setDisplayComingSoon(false);
          }, 1000 * 15);
          return;
        }
      }
    }
  }, [castInfo]);

  useEffect(() => {
    if (currentIndex < 0) {
      return;
    }

    if (playlist?.length === 0) {
      return;
    }

    const index = currentIndex % playlist.length;
    const currentPlaylist = playlist[index];
    setCastPreviewURL(currentPlaylist.previewURL);
    setCastStatus(true);
    const interval = setInterval(() => {
      setCurrentIndex((currentIndex) => (currentIndex + 1) % playlist.length);
    }, currentPlaylist.duration);

    return () => clearInterval(interval);
  }, [currentIndex, playlist]);

  return (
    <>
      {displayComingSoon && <ComingSoonPage screenRatio={screenRatio} />}
      {castStatus ?
        <div style={{ width: "100vw", height: "100vh" }}>
          <ArtworkPlayer previewURL={castPreviewURL!} />
        </div>
      : <>
          <HomePage
            screenRatio={screenRatio}
            deviceName={deviceName!}
            branchLink={branchLink!}
            currentArtwork={currentArtwork!}
          />
          {/* <OnboardingPage
            screenRatio={screenRatio}
            branchLink={branchLink!}
          /> */}
        </>
      }
    </>
  )
};

export default Home;
