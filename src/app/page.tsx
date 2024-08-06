"use client";

import { useState, useEffect, useRef } from "react";
import { detect, BrowserInfo } from "detect-browser";
import useWebSocket from "../utils/WebSocketManager";
import DeviceManager from "../utils/DeviceManager";
import {
  Artwork,
  EventType,
  PlayArtworkV2,
  PlaylistToken,
} from "@/utils/types";
import ArtworkPlayer from "./artworkPlayer";
import HomePage from "./homePage";
import ArtworkService from "@/utils/ArtworkService";
import { getIndex } from "@/utils/Playlist";

const Home = () => {
  const [branchLink, setBranchLink] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>("Unknown Device");
  const { locationID, topicID, castInfo, websocketEvent } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WEBSOCKET_URL!}/api/connection`,
    process.env.NEXT_PUBLIC_API_KEY!
  );
  const artworkService = useRef(new ArtworkService());
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(null);
  const [castStatus, setCastStatus] = useState<boolean | null>(false);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playlist, setPlaylist] = useState<PlaylistToken[]>([]);
  const [startTime, setStartTime] = useState<number>(0);

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
      const getNftTokens = async (ids: string[]) => {
        if (!ids.length) {
          return;
        }
        try {
          const data = await artworkService.current.queryTokens(ids);
          const artworks = castInfo?.artworks;
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
            setStartTime(castInfo.startTime);
            const i = getIndex(updatedArtworks, castInfo?.startTime);
            setCurrentIndex(i);
          }
        } catch (error) {
          console.log("Error fetching NFT tokens:", error);
        }
      };
      console.log("Cast Info:", castInfo);
      const assetIds = castInfo.artworks.map(
        (artwork: any) => artwork.token.id
      );
      getNftTokens(assetIds);
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

  useEffect(() => {
    if (!websocketEvent) {
      return;
    }

    switch (websocketEvent.type) {
      case EventType.next: {
        setCurrentIndex((currentIndex) => (currentIndex + 1) % playlist.length);
        break;
      }

      case EventType.previous: {
        if (currentIndex === 0) {
          setCurrentIndex(playlist.length - 1);
          return;
        }

        setCurrentIndex((currentIndex) => (currentIndex - 1) % playlist.length);
        break;
      }

      case EventType.updateDuration: {
        const artworks: PlayArtworkV2[] =
          websocketEvent.value as PlayArtworkV2[];
        const mapDuration = new Map<string, number>();
        artworks.forEach((artwork: any) => {
          mapDuration.set(artwork.token.id, artwork.duration);
        });
        const updatedPlaylist = playlist.map((playlistToken: PlaylistToken) => {
          return {
            ...playlistToken,
            duration: mapDuration.get(playlistToken.token.id) || 0,
          };
        });
        setPlaylist(updatedPlaylist);
        break;
      }
    }
  }, [websocketEvent]);

  if (castStatus) {
    return (
      <div style={{ width: "100vw", height: "100vh" }}>
        <ArtworkPlayer previewURL={castPreviewURL!} />
      </div>
    );
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
