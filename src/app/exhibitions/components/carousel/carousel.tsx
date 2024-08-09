import { Post, PostType } from '@/models';
import { SwiperOptions } from 'swiper/types';
import Swiper from 'swiper';
import 'swiper/scss';
import 'swiper/scss/effect-coverflow';
import 'swiper/scss/effect-fade';
import styles from './carousel.module.scss';
import { formatDateTime } from '@/utils/ui/formatDate';
import { useEffect, useState } from 'react';
import { setTimeout } from 'timers';
import { ViewMode } from '@/utils/types';
import useFormatCoverUri from '@/hook/useFormatCoverUri';

interface CarouselProps {
  items: Post[];
  index: number;
  onLoad: boolean;
  viewMode: ViewMode;
  screenRatio: number;
}

const Carousel: React.FC<CarouselProps> = ({
  items,
  index,
  onLoad,
  viewMode,
  screenRatio,
}) => {
  const [loading, setLoading] = useState(true);
  const swiperParams: SwiperOptions = {
    effect: 'coverflow',
    spaceBetween: 250,
    slidesPerView: 1.8,
    centeredSlides: true,
    coverflowEffect: {
      rotate: 0,
      stretch: 0,
      depth: 480,
      modifier: 1,
      slideShadows: false,
      scale: 0.5,
    },
    loop: false,
  };

  if (viewMode === ViewMode.landscape) {
    swiperParams.spaceBetween = 250 * screenRatio;
    swiperParams.coverflowEffect!.depth = 480 * screenRatio;
  } else {
    swiperParams.spaceBetween = 20 * screenRatio;
    swiperParams.coverflowEffect!.depth = 20 * screenRatio;
  }

  let swiper: Swiper;

  useEffect(() => {
    for (const item of items) {
      if (item.dateTime && !item.date && !item.time) {
        const { date, time } = formatDateTime(item.dateTime);
        item.date = date;
        item.time = time;
      }
    }
  }, [items]);

  useEffect(() => {
    if (!swiper) {
      swiper = new Swiper('.swiper', swiperParams);
    }

    setTimeout(() => {
      if (swiper && index !== undefined) {
        swiper.slideTo(index);
      }
    }, 300);
  }, [index]);

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [onLoad]);

  return (
    <div className="swiper" style={{ height: '100%' }}>
      <div className="swiper-wrapper">
        {items.map((item, index) => {
          const formattedCoverUri = useFormatCoverUri(item.coverURI);
          return (
            <div
              key={index}
              className="swiper-slide"
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
              {item.type === PostType.Note && (
                <div
                  className={styles.card}
                  style={{ padding: 40 * screenRatio, gap: 45 * screenRatio }}>
                  <p
                    className={styles.type}
                    style={{ fontSize: 22 * screenRatio }}>
                    Curators note
                  </p>
                  <p
                    className={styles.postTitle}
                    style={{ fontSize: 32 * screenRatio }}>
                    {item.title}
                  </p>
                  <p
                    className={styles.content}
                    style={{ fontSize: 32 * screenRatio }}
                    dangerouslySetInnerHTML={{ __html: item.content! }}></p>
                </div>
              )}

              {item.type === PostType.CloseUp && (
                <div
                  className={styles.card}
                  style={{ padding: 40 * screenRatio, gap: 45 * screenRatio }}>
                  <p
                    className={styles.type}
                    style={{ fontSize: 22 * screenRatio }}>
                    Close up
                  </p>
                  {formattedCoverUri && (
                    <img src={formattedCoverUri} alt="close up thumbnail" />
                  )}
                  <p
                    className={styles.postTitle}
                    style={{ fontSize: 32 * screenRatio }}>
                    {item.title}
                  </p>
                  {item.author && (
                    <p
                      className={styles.subContent}
                      style={{ fontSize: 26 * screenRatio }}>
                      by {item.author}
                    </p>
                  )}
                </div>
              )}

              {[
                PostType.Event,
                PostType.News,
                PostType.Schedule,
                PostType.WhitePaper,
              ].includes(item.type) && (
                <div
                  className={styles.card}
                  style={{ padding: 40 * screenRatio, gap: 45 * screenRatio }}>
                  <p
                    className={styles.type}
                    style={{ fontSize: 22 * screenRatio }}>
                    {item.type === PostType.WhitePaper
                      ? 'White paper'
                      : item.type}
                  </p>
                  {formattedCoverUri && (
                    <img src={formattedCoverUri} alt="event thumbnail" />
                  )}
                  <p
                    className={styles.postTitle}
                    style={{ fontSize: 32 * screenRatio }}>
                    {item.title}
                  </p>
                  {item.date && item.time && (
                    <div
                      className={styles.content}
                      style={{ fontSize: 32 * screenRatio }}>
                      <p>Date: {item.date}</p>
                      <p>Time: {item.time}</p>
                    </div>
                  )}
                  {item.author && (
                    <p
                      className={styles.subContent}
                      style={{ fontSize: 26 * screenRatio }}>
                      by {item.author}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Carousel;
