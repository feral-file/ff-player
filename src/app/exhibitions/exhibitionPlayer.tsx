'use client';

import { Exhibition, ExhibitionType, Post, Artwork } from '@/models';
import { useEffect, useRef, useState } from 'react';
import styles from './exhibition.module.scss';
import { CastCommand, ExhibitionCatalog, ViewMode } from '@/utils/types';
import Carousel from './components/carousel/carousel';
import { ExhibitionService, SeriesService, PostService } from '@/services';
import { useAppContext } from '@/context/AppContext';
import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { LeeMullican_EXHIBITION_CONTRACT } from '@/utils/constants';
import { formatArtworkIndexID } from '@/utils/indexer';
import { CastingArtworkType } from '@/models/metric.model';
import ArtworkService from '@/services/ArtworkService';

const ExhibitionHall = () => {
  const { context } = useAppContext();
  const { castInfo } = context.websocketData;
  const { screenRatio, viewMode } = context.deviceRotation ?? {
    screenRatio: 1,
    viewMode: ViewMode.landscape,
  };

  const [exhibitionID, setExhibitionID] = useState<string | undefined>();
  const [catalogID, setCatalogID] = useState<string | undefined>();
  const [screen, setScreen] = useState<ExhibitionCatalog | undefined>();
  const [artworkID, setArtworkID] = useState<string | undefined>();
  const [artworkPreviewMIMEType, setArtworkPreviewMIMEType] = useState<
    string | undefined
  >();

  const [pageSection, setSection] = useState<ExhibitionCatalog>(
    ExhibitionCatalog.home
  );
  const [exhibitionDetail, setExhibitionDetail] = useState<
    Exhibition | undefined
  >();
  const [posts, setPosts] = useState<Post[] | undefined>();
  const [postIndex, setPostIndex] = useState<number>(0);
  const [artwork, setArtwork] = useState<Artwork>();
  const artworkRef = useRef<Artwork>();

  // Services
  const exhibitionService = useRef(new ExhibitionService());
  const seriesService = useRef(new SeriesService());
  const artworkService = useRef(new ArtworkService());
  const postService = useRef(new PostService());

  const FERAL_FILE_ASSET_URL =
    (process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL ?? '') + '/';

  const getPreviewSource = async (
    artworkID: string,
    exhibition?: Exhibition
  ) => {
    const artwork = await seriesService.current.getArtwork(
      artworkID,
      exhibition
    );
    if (!artwork) {
      return;
    }

    artwork.previewURI = artworkService.current.getArtworkPreview(artwork);
    setArtwork(artwork);

    // Set mixpanel metadata
    if (artwork !== artworkRef.current) {
      artworkRef.current = artwork;
      if (exhibition) {
        const artworkID = formatArtworkIndexID(artworkRef.current, exhibition);
        setArtworkID(artworkID);
      } else {
        setArtworkID(artworkRef.current.id);
      }

      setArtworkPreviewMIMEType(artworkRef.current.previewMIMEType);
    }
  };

  useEffect(() => {
    if (castInfo) {
      const handleCastCommand = () => {
        if (castInfo.castCommand === CastCommand.castExhibition) {
          setExhibitionID(castInfo.exhibitionId);
          setCatalogID(castInfo.catalogId);
          setScreen(castInfo.catalog);
        }
      };
      handleCastCommand();
    } else {
      setArtwork({} as Artwork);
    }
  }, [castInfo]);

  useEffect(() => {
    // fetch exhibition detail
    const fetchExhibitionDetail = async () => {
      setExhibitionDetail(undefined);
      if (!exhibitionID) {
        return;
      }

      const exhibition =
        await exhibitionService.current.getExhibition(exhibitionID);

      if (!exhibition) {
        return;
      }

      setExhibitionDetail(exhibition);
      fetchPosts(exhibition).catch((err: unknown) => {
        console.error(err);
      });
    };

    const fetchPosts = async (exhibition: Exhibition) => {
      const posts = await postService.current.getPostExhibition(exhibition);
      setPosts(posts);
    };

    if (exhibitionID && exhibitionDetail?.id !== exhibitionID) {
      fetchExhibitionDetail().catch((err: unknown) => {
        console.error(err);
      });
    }
  }, [exhibitionID, exhibitionDetail?.id]);

  useEffect(() => {
    if (screen !== undefined) {
      const getPostIndexByID = (id: string) => {
        if (!posts) {
          return;
        }

        const index = posts.findIndex(post => post.id === id);
        if (index !== -1) {
          setPostIndex(index);
        }
      };

      switch (screen) {
        case ExhibitionCatalog.home:
          setArtwork(undefined);
          break;
        case ExhibitionCatalog.curatorNote:
          setPostIndex(0);
          break;
        case ExhibitionCatalog.resource:
          if (catalogID) getPostIndexByID(catalogID);
          break;
        case ExhibitionCatalog.artwork:
          if (catalogID && exhibitionDetail) {
            getPreviewSource(catalogID, exhibitionDetail).catch(
              (err: unknown) => {
                console.error(err);
              }
            );
          }
          break;
      }

      setSection(screen);
    }
  }, [screen, catalogID, exhibitionDetail, posts]);

  return (
    <div
      className={
        viewMode === ViewMode.landscape ? styles.landscape : styles.portrait
      }>
      {exhibitionDetail && pageSection === ExhibitionCatalog.home && (
        <div
          className={[styles.exhCard].join(' ')}
          style={{ fontSize: 22 * screenRatio }}>
          <div
            className={styles.leftSection}
            style={{ padding: 60 * screenRatio }}>
            <div className={styles.info} style={{ gridGap: 40 * screenRatio }}>
              <p
                className={styles.title}
                style={{ fontSize: 48 * screenRatio }}>
                {exhibitionDetail.title}
              </p>
              {exhibitionDetail.curatorAlumni && (
                <div>
                  <p
                    className={styles.subTitle}
                    style={{ fontSize: 18 * screenRatio }}>
                    Curator
                  </p>
                  <p>{exhibitionDetail.curatorAlumni.alias}</p>
                </div>
              )}
              <div>
                {exhibitionDetail.type === ExhibitionType.group && (
                  <p
                    className={styles.subTitle}
                    style={{ fontSize: 18 * screenRatio }}>
                    Group Exhibition
                  </p>
                )}
                {exhibitionDetail.type === ExhibitionType.solo && (
                  <p
                    className={styles.subTitle}
                    style={{ fontSize: 18 * screenRatio }}>
                    Solo Exhibition
                  </p>
                )}
                {exhibitionDetail.artistsAlumni?.length && (
                  <p>
                    {exhibitionDetail.artistsAlumni
                      .map(artist => artist.alias)
                      .join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className={styles.rightSection}>
            <div
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={FERAL_FILE_ASSET_URL + (exhibitionDetail.coverURI ?? '')}
                alt={exhibitionDetail.title ?? ''}
              />
            </div>
          </div>
        </div>
      )}
      {exhibitionDetail &&
        [ExhibitionCatalog.curatorNote, ExhibitionCatalog.resource].includes(
          pageSection
        ) &&
        posts?.length && (
          <div className={[styles.posts].join(' ')}>
            <div className={styles.postList}>
              <Carousel
                items={posts}
                index={postIndex}
                screenRatio={screenRatio}></Carousel>
            </div>
          </div>
        )}
      {exhibitionDetail && pageSection === ExhibitionCatalog.artwork && (
        <div className={[styles.exhCard, styles.fadeInBottom].join(' ')}>
          {artwork?.previewURI && (
            <ArtworkPlayer
              key={artwork.id}
              previewURL={artwork.previewURI}
              artworkID={artworkID ?? ''}
              artworkPreviewMIMEType={artworkPreviewMIMEType}
              castingType={CastingArtworkType.Exhibition}
              isCustomView={
                exhibitionDetail.contracts &&
                exhibitionDetail.contracts[0]?.address ===
                  LeeMullican_EXHIBITION_CONTRACT
              }
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ExhibitionHall;
