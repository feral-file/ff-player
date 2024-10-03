'use client';

import { clsx } from 'clsx';
import styles from './info-styles.module.scss';
import { Artwork, IndexerToken } from '@/models';
import { useEffect, useRef, useState } from 'react';
import ArtworkService from '@/services/ArtworkService';

// Display information overlay, detail for daily artwork casting only
const DisplayInfo: React.FC<{
  token: IndexerToken;
  isDaily: boolean;
  ffArtworkID?: string;
  dailyNote?: string;
}> = ({ token, isDaily, ffArtworkID, dailyNote }) => {
  const [onFocused, setOnFocused] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mediumDescription, setMediumDescription] = useState<string[]>([]);
  const [artwork, setArtwork] = useState<Artwork | undefined>();
  const artworkService = useRef(new ArtworkService());

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  useEffect(() => {
    if (!isDaily) {
      setOnFocused(false); // For non-daily artwork, always collapsed
    }
  }, [isDaily]);

  useEffect(() => {
    if (ffArtworkID) {
      const fetchArtwork = async () => {
        try {
          const artwork =
            await artworkService.current.getArtworkDetail(ffArtworkID);
          if (artwork) {
            setArtwork(artwork);
            setMediumDescription(
              artwork.series?.metadata?.mediumDescription || []
            );
          }
        } catch (error) {
          console.log('Error fetching artwork detail', JSON.stringify(error));
        }
      };

      fetchArtwork();
    }
  }, [ffArtworkID]);

  return (
    <div className={styles['main-content']}>
      {onFocused ? (
        // Expanded
        <div
          className={clsx(
            styles.item,
            styles['full-artwork-info'],
            styles.active
          )}>
          <h1>Daily</h1>
          <hr />
          <div>
            <div>
              <p>{token.asset.metadata.project.latest.artistName}</p>
              <p>{token.asset.metadata.project.latest.title}</p>
            </div>
          </div>
          <div className={clsx(styles.scrollableSection, styles.collapse)}>
            <div>
              {mediumDescription.map((desc, index) => (
                <p key={index}>{desc}</p>
              ))}
            </div>
            <div>
              <p
                dangerouslySetInnerHTML={{
                  __html: artwork?.series?.description || '',
                }}></p>
            </div>
            <div className={styles.dailyNote}>
              <p dangerouslySetInnerHTML={{ __html: dailyNote || '' }}></p>
            </div>
          </div>

          <div className={styles['read-more-container']}>
            <img src={'/images/read-more.svg'} alt="read more" />
            <p>
              Press <span style={{ fontStyle: 'italic' }}>[OK]</span> to Read
              More
            </p>
          </div>
        </div>
      ) : (
        // Collapsed
        <div className={clsx(styles.item, styles['short-artwork-info'])}>
          <p>{token.asset.metadata.project.latest.artistName}</p>
          <p>{token.asset.metadata.project.latest.title}</p>
        </div>
      )}
    </div>
  );
};

export default DisplayInfo;
