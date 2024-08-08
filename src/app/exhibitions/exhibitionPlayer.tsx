"use client";

import {
  Exhibition,
  Series,
  ExhibitionType,
  Post,
  PostType,
  Artwork,
} from "@/models";
import { useEffect, useRef, useState } from "react";
import styles from "./exhibition.module.scss";
import "./exhibition.module.scss";
import { ExhibitionCatalog } from "@/utils/types";
import Carousel from "./components/carousel";
import ArtworkPlayer from "../artworkPlayer";
import { ExhibitionService, SeriesService, PostService } from "@/services";

const ExhibitionHall = ({
  exhibitionID,
  catalogID,
  screen,
}: {
  exhibitionID: string | undefined;
  catalogID: string | undefined;
  screen: ExhibitionCatalog | undefined;
}) => {
  const [pageSection, setSection] = useState<ExhibitionCatalog>(
    ExhibitionCatalog.home
  );
  const [exhibitionDetail, setExhibitionDetail] = useState<
    Exhibition | undefined
  >();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postIndex, setPostIndex] = useState<number>(0);
  const [listSeries, setSeriesOverview] = useState<Series[]>([]);
  const [artwork, setArtwork] = useState<Artwork>();
  const exhibitionService = useRef(new ExhibitionService());
  const postService = useRef(new PostService());
  const seriesService = useRef(new SeriesService());

  const FERAL_FILE_ASSET_URL =
    process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL! + "/";

  // For not minted exhibition
  const getSeriesOverview = async (series: Series[]) => {
    const seriesOverview: Series[] = series.sort((a, b) =>
      a.displayIndex > b.displayIndex ? 1 : -1
    );

    const promises: Promise<Artwork[]>[] = [];
    for (const s of seriesOverview) {
      promises.push(seriesService.current.getArtworkOfSeries(s.id));
    }

    await Promise.all(promises).then((results) => {
      for (const result of results) {
        const index = results.indexOf(result);
        seriesOverview[index].artworks = result;
        seriesOverview[index].firstArtwork = result[0];
      }
    });

    setSeriesOverview(seriesOverview);
  };

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
      // getSeriesOverview(exhibition?.series!);
    };

    const fetchPosts = async (exhibition: Exhibition) => {
      if (!exhibitionID) {
        return;
      }

      let posts = await postService.current.getPostExhibition(exhibitionID);

      // Add curator note as the first post
      const curatorNote = {
        type: PostType.Note,
        title: exhibition?.noteTitle,
        content: exhibition?.noteBrief,
      } as Post;
      posts = [curatorNote, ...posts];
      console.log("posts", posts);
      setPosts(posts);
    };

    if (exhibitionID && !exhibitionDetail) {
      fetchExhibitionDetail();
    }
  }, [exhibitionID]);

  useEffect(() => {
    const getPostIndexByID = (id: string) => {
      if (!posts) {
        return;
      }

      const index = posts.findIndex((post) => post.id === id);
      setPostIndex(index + 1); // +1 to count the curator note
    };

    if (screen !== undefined) {
      setSection(screen);

      if (screen === ExhibitionCatalog.curatorNote) {
        setPostIndex(0);
      } else if (screen === ExhibitionCatalog.resource) {
        getPostIndexByID(catalogID!);
      } else if (screen === ExhibitionCatalog.artwork) {
        getPreviewSource(catalogID!);
      }
    }
  }, [screen]);

  return (
    <div className={styles.mainContainer}>
      {exhibitionDetail && pageSection === ExhibitionCatalog.home && (
        <div className={[styles.exhCard].join(" ")}>
          <div className={styles.leftSection}>
            <div className={styles.info}>
              <p className={styles.title}>{exhibitionDetail.title}</p>
              {exhibitionDetail.curator && (
                <div>
                  <p className={styles.subTitle}>Curator</p>
                  <p>{exhibitionDetail.curator.alias}</p>
                </div>
              )}
              <div>
                {exhibitionDetail.type === ExhibitionType.group && (
                  <p className={styles.subTitle}>Group Exhibition</p>
                )}
                {exhibitionDetail.type === ExhibitionType.solo && (
                  <p className={styles.subTitle}>Solo Exhibition</p>
                )}
                {exhibitionDetail.artists?.length && (
                  <p>
                    {exhibitionDetail.artists
                      .map((artist) => artist.alias)
                      .join(", ")}
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
          <div className={[styles.posts].join(" ")}>
            <div className={styles.postList}>
              <Carousel
                items={posts!}
                index={postIndex}
                onLoad={[
                  ExhibitionCatalog.curatorNote,
                  ExhibitionCatalog.resource,
                ].includes(pageSection)}
              ></Carousel>
            </div>
          </div>
        )}
      {exhibitionDetail && pageSection === ExhibitionCatalog.artwork && (
        <div className={[styles.exhCard, styles.fadeInBottom].join(" ")}>
          {artwork?.previewURI && (
            <ArtworkPlayer key={artwork.id} previewURL={artwork.previewURI!} />
          )}
        </div>
      )}
    </div>
  );
};

export default ExhibitionHall;
