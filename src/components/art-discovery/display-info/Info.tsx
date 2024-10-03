'use client';

import { clsx } from 'clsx';
import styles from './info-styles.module.scss';
import { Artwork, IndexerToken } from '@/models';
import { useEffect, useRef, useState } from 'react';
import ArtworkService from '@/services/ArtworkService';
import { KeyboardEventKey } from '@/constants';

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
  const lastEventTime = useRef(0);
  const okBtnRef = useRef<HTMLDivElement>(null);
  const backBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        // Press Enter to expand

        switch (event.key as KeyboardEventKey) {
          case KeyboardEventKey.Enter:
            setIsExpanded(true);
            break;

          case KeyboardEventKey.Backspace:
            setIsExpanded(false);
            break;

          default:
            break;
        }
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.target instanceof HTMLElement &&
        okBtnRef.current &&
        okBtnRef.current.contains(event.target)
      ) {
        setIsExpanded(true);
      } else if (
        event.target instanceof HTMLElement &&
        backBtnRef.current &&
        backBtnRef.current.contains(event.target)
      ) {
        setIsExpanded(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('click', handleClick);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, []); // Initial render

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
        // On focus
        <div
          className={clsx(
            styles.item,
            styles['full-artwork-info'],
            onFocused ? styles.active : ''
          )}>
          <div>
            <div>
              <p>{token.asset.metadata.project.latest.artistName}</p>
              <p style={{ fontWeight: 'bold' }}>
                {token.asset.metadata.project.latest.title}
              </p>
              <br />
            </div>
          </div>
          <div
            className={clsx(
              styles.scrollableSection,
              isExpanded ? '' : styles.collapse
            )}>
            <div>
              {mediumDescription.map((desc, index) => (
                <p key={index}>{desc}</p>
              ))}
              <br />
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

          {isExpanded ? (
            <div ref={backBtnRef} className={styles['control-container']}>
              <img src={'/images/back-arrow.svg'} alt="back" />
              <p>
                Press <span style={{ fontStyle: 'italic' }}>[back]</span> to
                Exit
              </p>
            </div>
          ) : (
            <div ref={okBtnRef} className={styles['control-container']}>
              <img src={'/images/read-more.svg'} alt="read more" />
              <p>
                Press <span style={{ fontStyle: 'italic' }}>[OK]</span> to Read
                More
              </p>
            </div>
          )}
        </div>
      ) : (
        // Lose focus
        <div className={clsx(styles.item, styles['short-artwork-info'])}>
          <p>{token.asset.metadata.project.latest.artistName}</p>
          <p>{token.asset.metadata.project.latest.title}</p>
        </div>
      )}
    </div>
  );
};

export default DisplayInfo;
