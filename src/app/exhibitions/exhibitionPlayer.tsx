'use client';

import { Exhibition, ExhibitionType, Post, Artwork } from '@/models';
import { useContext, useEffect, useRef, useState } from 'react';
import styles from './exhibition.module.scss';
import './exhibition.module.scss';
import { CastCommand, ExhibitionCatalog, ViewMode } from '@/utils/types';
import Carousel from './components/carousel/carousel';
import ArtworkPlayer from '@/components/ArtworkPlayer';
import { ExhibitionService, SeriesService, PostService } from '@/services';
import Image from 'next/image';
import { AppContext } from '@/context/AppContext';
import { set } from 'date-fns';

const ExhibitionHall = () => {
  const context = useContext(AppContext);
  if (!context) {
    return <p>There is no App context.</p>;
  }
  const { castInfo } = context.websocketData;

  const [exhibitionID, setExhibitionID] = useState<string | undefined>();
  const [catalogID, setCatalogID] = useState<string | undefined>();
  const [screen, setScreen] = useState<ExhibitionCatalog | undefined>();

  const [pageSection, setSection] = useState<ExhibitionCatalog>(
    ExhibitionCatalog.home
  );
  const [exhibitionDetail, setExhibitionDetail] = useState<
    Exhibition | undefined
  >();
  const [posts, setPosts] = useState<Post[] | undefined>();
  const [postIndex, setPostIndex] = useState<number>(0);
  const [artwork, setArtwork] = useState<Artwork>();
  const exhibitionService = useRef(new ExhibitionService());
  const seriesService = useRef(new SeriesService());
  const postService = useRef(new PostService());
  const { screenRatio, viewMode } = useContext(AppContext)?.deviceRotation ?? {
    screenRatio: 1,
    viewMode: ViewMode.landscape,
  };

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

    artwork.previewURI = seriesService.current.getArtworkPreview(artwork);
    console.log('artwork', artwork);
    console.log('artwork.previewURI', artwork.previewURI);

    setArtwork(artwork);
  };

  useEffect(() => {
    console.log('castInfo', castInfo);

    if (castInfo) {
      const handleCastCommand = async () => {
        if (castInfo.castCommand === CastCommand.castExhibition) {
          setExhibitionID(castInfo.exhibitionId);
          setCatalogID(castInfo.catalogId);
          setScreen(castInfo.catalog);
        }
      };
      handleCastCommand().catch((error: unknown) => {
        console.error(error);
      });
    }
  }, [castInfo]);

  useEffect(() => {
    console.log('exhibitionID', exhibitionID);

    // fetch exhibition detail
    const fetchExhibitionDetail = async () => {
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
  }, [exhibitionID]);

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
            <div className={styles.info} style={{ gap: 40 * screenRatio }}>
              <p
                className={styles.title}
                style={{ fontSize: 48 * screenRatio }}>
                {exhibitionDetail.title}
              </p>
              {exhibitionDetail.curator && (
                <div>
                  <p
                    className={styles.subTitle}
                    style={{ fontSize: 18 * screenRatio }}>
                    Curator
                  </p>
                  <p>{exhibitionDetail.curator.alias}</p>
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
                {exhibitionDetail.artists?.length && (
                  <p>
                    {exhibitionDetail.artists
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
              <Image
                src={FERAL_FILE_ASSET_URL + (exhibitionDetail.coverURI ?? '')}
                alt={exhibitionDetail.title ?? ''}
                layout="fill"
                objectFit="contain"
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
                onLoad={[
                  ExhibitionCatalog.curatorNote,
                  ExhibitionCatalog.resource,
                ].includes(pageSection)}
                screenRatio={screenRatio}></Carousel>
            </div>
          </div>
        )}
      {exhibitionDetail && pageSection === ExhibitionCatalog.artwork && (
        <div className={[styles.exhCard, styles.fadeInBottom].join(' ')}>
          {artwork?.previewURI && (
            <ArtworkPlayer key={artwork.id} previewURL={artwork.previewURI} />
          )}
        </div>
      )}
    </div>
  );
};

export default ExhibitionHall;
