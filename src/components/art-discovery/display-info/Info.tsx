'use client';

import { clsx } from 'clsx';
import styles from './info-styles.module.scss';
import {
  Artwork,
  Exhibition,
  ExhibitionType,
  IndexerToken,
  User,
} from '@/models';
import { useEffect, useRef, useState } from 'react';
import ArtworkService from '@/services/ArtworkService';
import FocusableLeaf from '../components/focusable-leaf/focusable-leaf';
import OptionsButton from './components/options-button/options-button';
import FocusableContainer from '../components/focusable-container/focusable-container';
import OptionsDrawer, {
  OptionsDrawerLeafKey,
} from './components/options-drawer/options-drawer';
import { ExhibitionService } from '@/services';
import { KeyboardEventKey } from '@/constants';

enum InfoFocusableLeafKey {
  DisplayInfo = 'display-info',
  ReadMoreButton = 'read-more-button',
  OptionsButton = 'options-button',
  DrawOptionsButton = 'draw-options-button',
  InfoLoseFocus = 'info-lose-focus',
}

const SCROLL_AMOUNT = 150;

// Display information overlay, detail for daily artwork casting only
const DisplayInfo: React.FC<{
  token: IndexerToken | undefined;
  ffArtworkID?: string;
  dailyNote?: string;
  hasFocusedChild?: boolean;
  isInfoExpanded?: boolean;
  onInfoExpandedChanged: (value: boolean) => void;
  isOptionsExpanded?: boolean;
  onOptionsExpandedChanged: (value: boolean) => void;
}> = ({
  token,
  ffArtworkID,
  dailyNote,
  hasFocusedChild,
  isInfoExpanded,
  onInfoExpandedChanged,
  isOptionsExpanded,
  onOptionsExpandedChanged,
}) => {
  const [artwork, setArtwork] = useState<Artwork | undefined>();
  const [mediumDescription, setMediumDescription] = useState<string[]>([]);
  const [artist, setArtist] = useState<User | undefined>();
  const [exhibition, setExhibition] = useState<Exhibition>();
  const artworkService = useRef(new ArtworkService());
  const exhibitionService = useRef(new ExhibitionService());
  const okBtnRef = useRef<HTMLDivElement>(null);
  const backBtnRef = useRef<HTMLDivElement>(null);
  const scrollableSectionRef = useRef<HTMLDivElement>(null);
  const FERAL_FILE_ASSET_URL =
    (process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL ?? '') + '/';

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.target instanceof HTMLElement &&
        okBtnRef.current?.contains(event.target)
      ) {
        onInfoExpandedChanged(true);
      } else if (
        event.target instanceof HTMLElement &&
        backBtnRef.current?.contains(event.target)
      ) {
        onInfoExpandedChanged(false);
      }
    };

    if (hasFocusedChild && typeof window !== 'undefined') {
      window.addEventListener('click', handleClick);
    }

    return () => {
      window.removeEventListener('click', handleClick);
    };
  }, [hasFocusedChild, onInfoExpandedChanged]); // Initial render

  useEffect(() => {
    if (ffArtworkID) {
      const fetchArtwork = async () => {
        try {
          const artwork =
            await artworkService.current.getArtworkDetail(ffArtworkID);
          if (artwork) {
            setArtwork(artwork);
            setArtist(artwork.series?.artist);
            setMediumDescription(
              artwork.series?.metadata?.mediumDescription ?? []
            );
          }
        } catch (error) {
          console.log('Error fetching artwork detail', JSON.stringify(error));
        }
      };

      fetchArtwork().catch((error: unknown) => {
        console.log(error);
      });
    }
  }, [ffArtworkID]);

  useEffect(() => {
    const fetchExhibition = async () => {
      if (artwork?.series?.exhibitionID) {
        try {
          const exhibition = await exhibitionService.current.getExhibition(
            artwork.series.exhibitionID
          );
          if (exhibition) {
            setExhibition(exhibition);
          }
        } catch (error) {
          console.log(
            'Error fetching exhibition detail',
            JSON.stringify(error)
          );
        }
      }
    };

    fetchExhibition().catch((error: unknown) => {
      console.log(error);
    });
  }, [artwork]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (scrollableSectionRef.current) {
        switch (event.key as KeyboardEventKey) {
          case KeyboardEventKey.ArrowUp: {
            scrollableSectionRef.current.scrollBy({
              top: -SCROLL_AMOUNT,
              behavior: 'smooth',
            });
            break;
          }

          case KeyboardEventKey.ArrowDown: {
            scrollableSectionRef.current.scrollBy({
              top: +SCROLL_AMOUNT,
              behavior: 'smooth',
            });
            break;
          }

          default: {
            break;
          }
        }
      }
    };

    if (isInfoExpanded) {
      scrollableSectionRef.current?.focus();
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
      }
    } else {
      scrollableSectionRef.current?.blur();
      scrollableSectionRef.current?.scrollTo(0, 0);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isInfoExpanded]);

  return (
    <>
      <div className={styles['main-content']}>
        {hasFocusedChild && !!(token || artwork) ? (
          // On focus
          <div
            className={clsx(
              styles.item,
              styles['full-artwork-info'],
              styles.active
            )}>
            <div>
              <div>
                <p>
                  {token?.asset.metadata.project.latest.artistName ??
                    artist?.alumniAccount?.alias}
                  ,
                </p>
                <p style={{ fontWeight: 'bold' }}>
                  <span style={{ fontStyle: 'italic' }}>
                    {token?.asset.metadata.project.latest.title ??
                      artwork?.series?.title}
                  </span>{' '}
                  (
                  {new Date(
                    token?.mintedAt ?? artwork?.mintedAt ?? ''
                  ).getFullYear()}
                  )
                </p>
                <br />
              </div>
              {!isInfoExpanded &&
                (isOptionsExpanded ? (
                  <FocusableContainer
                    className={styles.optionsDrawerContainer}
                    initialFocusKey={OptionsDrawerLeafKey.OptionsButton}
                    isFocusBoundary={true}>
                    <OptionsDrawer
                      onClosed={() => {
                        onOptionsExpandedChanged(false);
                      }}></OptionsDrawer>
                  </FocusableContainer>
                ) : (
                  <FocusableLeaf
                    key={InfoFocusableLeafKey.OptionsButton}
                    focusKey={InfoFocusableLeafKey.OptionsButton}
                    className={styles.optionsButtonLeaf}
                    onEnterPress={() => {
                      onOptionsExpandedChanged(true);
                    }}>
                    <OptionsButton></OptionsButton>
                  </FocusableLeaf>
                ))}
            </div>
            <div // Scrollable section, put all the artwork detail here
              className={clsx(
                styles.scrollableSection,
                isInfoExpanded ? '' : styles.collapse
              )}
              ref={scrollableSectionRef}
              tabIndex={-1}>
              {mediumDescription.length > 0 && (
                <div>
                  {mediumDescription.map((desc, index) => (
                    <p key={index}>{desc}</p>
                  ))}
                  <br />
                </div>
              )}
              <div>
                <p
                  dangerouslySetInnerHTML={{
                    __html:
                      token?.asset.metadata.project.latest.description ??
                      artwork?.series?.description ??
                      '',
                  }}></p>
              </div>
              {!!dailyNote && (
                <div className={styles.dailyNote}>
                  <p style={{ paddingBottom: '0.8em' }}>Daily Note:</p>
                  <p dangerouslySetInnerHTML={{ __html: dailyNote || '' }}></p>
                </div>
              )}
              {!!ffArtworkID && !!artist && (
                // Show artist info if this is FF artwork
                <div className={styles.artistSection}>
                  <p className={styles.subTitle}>Artist Profile</p>
                  <div className={styles.avatar}>
                    <img
                      src={
                        FERAL_FILE_ASSET_URL +
                        (artist.alumniAccount?.avatarURI ?? '')
                      }
                      alt="avatar"
                    />
                  </div>
                  <div>
                    <p className={styles.artistName}>
                      {token?.asset.metadata.project.latest.artistName ??
                        artist.alumniAccount?.alias}
                    </p>
                    {artist.alumniAccount?.location && (
                      <p className={styles.subContent}>
                        {artist.alumniAccount.location}
                      </p>
                    )}
                  </div>
                  {artist.alumniAccount?.bio && (
                    <p
                      dangerouslySetInnerHTML={{
                        __html: artist.alumniAccount.bio,
                      }}></p>
                  )}
                </div>
              )}
              {!!ffArtworkID && !!exhibition && (
                // Show the exhibition info if this is FF artwork
                <div className={styles.exhibitionSection}>
                  <p className={styles.subTitle}>Exhibited in</p>
                  {exhibition.coverURI && (
                    <div className={styles.exhThumbnail}>
                      <img
                        src={FERAL_FILE_ASSET_URL + exhibition.coverURI}
                        alt="exhibition"
                      />
                    </div>
                  )}
                  <div className={styles.exhTopInfo}>
                    <p className={styles.exhibitionName}>{exhibition.title}</p>
                    <div className={styles.exhInfo}>
                      {exhibition.curator && (
                        <p>
                          Curated by {exhibition.curator?.alumniAccount?.alias}
                        </p>
                      )}
                      <p>
                        {exhibition.type === ExhibitionType.group
                          ? 'Group Exhibition'
                          : 'Solo Exhibition'}
                      </p>
                    </div>
                  </div>
                  {exhibition.noteBrief && (
                    <p
                      dangerouslySetInnerHTML={{
                        __html: exhibition.noteBrief,
                      }}></p>
                  )}
                </div>
              )}
            </div>
            <FocusableLeaf
              key={InfoFocusableLeafKey.ReadMoreButton}
              focusKey={InfoFocusableLeafKey.ReadMoreButton}
              onEnterPress={() => {
                onInfoExpandedChanged(true);
              }}>
              {isInfoExpanded ? (
                <div ref={backBtnRef} className={styles['control-container']}>
                  <p style={{ cursor: 'pointer' }}>
                    Press <span style={{ fontStyle: 'italic' }}>[back]</span> to
                    exit
                  </p>
                </div>
              ) : (
                <div ref={okBtnRef} className={styles['control-container']}>
                  <p style={{ cursor: 'pointer' }}>
                    Press <span style={{ fontStyle: 'italic' }}>[OK]</span> to
                    Read More
                  </p>
                </div>
              )}
            </FocusableLeaf>
          </div>
        ) : (
          // Lose focus
          <FocusableLeaf
            key={InfoFocusableLeafKey.InfoLoseFocus}
            focusKey={InfoFocusableLeafKey.InfoLoseFocus}
            style={{ width: '100%' }}>
            {!!(token || artwork) && (
              <div className={clsx(styles.item, styles['short-artwork-info'])}>
                <p>
                  {token?.asset.metadata.project.latest.artistName ??
                    artist?.alumniAccount?.alias}
                  ,
                </p>
                <p style={{ fontWeight: 'bold' }}>
                  <span style={{ fontStyle: 'italic' }}>
                    {token?.asset.metadata.project.latest.title ??
                      artwork?.series?.title ??
                      ''}
                  </span>{' '}
                  (
                  {new Date(
                    token?.mintedAt ?? artwork?.mintedAt ?? ''
                  ).getFullYear()}
                  )
                </p>
              </div>
            )}
          </FocusableLeaf>
        )}
      </div>
    </>
  );
};

export default DisplayInfo;
