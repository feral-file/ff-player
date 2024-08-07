"use client";

import { Exhibition, Series, ExhibitionType } from "@/models";
import { useEffect, useRef, useState } from "react";
import { ExhibitionService } from "@/services/exhibition.service";
import styles from "./exhibition.module.scss";
import { useSearchParams } from 'next/navigation'

const ExhibitionHall = () => {
  const [exhibitionDetail, setExhibitionDetail] = useState<Exhibition | undefined>();
  // const [series, setSeries] = useState<Series | null>(null);
  const exhibitionService = useRef(new ExhibitionService());

  const FERAL_FILE_ASSET_URL = process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL! + '/';
  const searchParams = useSearchParams()
  const exhibitionID = searchParams.get('id');

  useEffect(() => {
    // fetch exhibition detail
    const fetchExhibitionDetail = async () => {
      if (!exhibitionID) {
        return;
      }

      const exhibition =
          await exhibitionService.current.getExhibition(exhibitionID);
        console.log("Exhibition:", exhibition);
      setExhibitionDetail(exhibition);
    };

    if (exhibitionID) {
      fetchExhibitionDetail();
    }
  }, [exhibitionID]);

  return (
    <div
      className={styles.mainContainer}
    >
      {exhibitionDetail && (
        <div className={styles.exhCard}>
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
                    {exhibitionDetail.artists.map((artist) => artist.alias).join(", ")}
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
    </div>
  );
};

export default ExhibitionHall;
