'use client';

import {
  Exhibition,
  Series,
  ExhibitionType,
  Post,
  PostType,
  Artwork,
} from '@/models';
import { useEffect, useRef, useState } from 'react';
import styles from './exhibition.module.scss';
import './exhibition.module.scss';
import { ExhibitionCatalog, ViewMode } from '@/utils/types';
import Carousel from './components/carousel/carousel';
import ArtworkPlayer from '@/components/artworkPlayer';
import { ExhibitionService, SeriesService, PostService } from '@/services';

const ExhibitionHall = ({
  exhibitionID,
  catalogID,
  screen,
  viewMode,
  screenRatio,
}: {
  exhibitionID: string | undefined;
  catalogID: string | undefined;
  screen: ExhibitionCatalog | undefined;
  viewMode: ViewMode;
  screenRatio: number;
}) => {
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

  const FERAL_FILE_ASSET_URL =
    process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL! + '/';

  const getPreviewSource = async (artworkID: string) => {
    const artwork = await seriesService.current.getArtwork(artworkID);
    if (!artwork) {
      return;
    }

    artwork.previewURI = seriesService.current.getArtworkPreview(artwork);
    setArtwork(artwork);
  };

  useEffect(() => {
    // fetch exhibition detail
    const fetchExhibitionDetail = async () => {
      if (!exhibitionID) {
        return;
      }

      const exhibition = await exhibitionService.current.getExhibition(
        exhibitionID
      );

      setExhibitionDetail(exhibition);
      fetchPosts(exhibition!);
    };

    const fetchPosts = async (exhibition: Exhibition) => {
      if (!exhibitionID) {
        return;
      }

      let posts = exhibition.posts || [];

      // Add curator note as the first post
      const curatorNote = {
        id: 'curatorNote',
        type: PostType.Note,
        title: exhibition?.noteTitle,
        content: exhibition?.noteBrief,
      } as Post;
      posts = [curatorNote, ...posts];
      setPosts(posts);
    };

    if (exhibitionID && exhibitionDetail?.id !== exhibitionID) {
      fetchExhibitionDetail();
    }
  }, [exhibitionID]);

  useEffect(() => {
    const getPostIndexByID = (id: string) => {
      if (!posts) {
        return;
      }

      const index = posts.findIndex(post => post.id === id);
      setPostIndex(index);
    };

    if (screen !== undefined) {
      switch (screen) {
        case ExhibitionCatalog.curatorNote:
          setPostIndex(0);
          break;
        case ExhibitionCatalog.resource:
          getPostIndexByID(catalogID!);
          break;
        case ExhibitionCatalog.artwork:
          getPreviewSource(catalogID!);
          break;
      }

      setSection(screen);
    }
  }, [screen]);

  return (
    <div className={styles.mainContainer}>
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
            <img
              src={FERAL_FILE_ASSET_URL + exhibitionDetail.coverURI}
              alt={exhibitionDetail.title}
            />
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
                items={posts!}
                index={postIndex}
                onLoad={[
                  ExhibitionCatalog.curatorNote,
                  ExhibitionCatalog.resource,
                ].includes(pageSection)}
                viewMode={viewMode}
                screenRatio={screenRatio}></Carousel>
            </div>
          </div>
        )}
      {exhibitionDetail && pageSection === ExhibitionCatalog.artwork && (
        <div className={[styles.exhCard, styles.fadeInBottom].join(' ')}>
          {artwork?.previewURI && (
            <ArtworkPlayer key={artwork.id} previewURL={artwork.previewURI!} />
          )}
        </div>
      )}
    </div>
  );
};

export default ExhibitionHall;
