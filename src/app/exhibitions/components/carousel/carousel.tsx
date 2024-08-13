import { Post, PostType } from '@/models';
import { Swiper as SwiperType } from 'swiper/types';
import 'swiper/scss';
import 'swiper/scss/effect-coverflow';
import 'swiper/scss/effect-fade';
import styles from './carousel.module.scss';
import { formatDateTime } from '@/utils/ui/formatDate';
import { useEffect, useState } from 'react';
import { setTimeout } from 'timers';
import { ViewMode } from '@/utils/types';
import QueuingImages from '../queuingImages/queuingImages';
import { Swiper, SwiperSlide } from 'swiper/react';

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
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [spaceBetween, setSpaceBetween] = useState(250);
  const handleSwiper = (swiperInstance: SwiperType) => {
    setSwiper(swiperInstance);
  };

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
      (swiperInstance: SwiperType) => {
        setSwiper(swiperInstance);
      };
    } else {
      swiper.slideTo(index);
    }
  }, [index, swiper]);

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [onLoad]);

  useEffect(() => {
    if (viewMode === ViewMode.landscape) {
      setSpaceBetween(250 * screenRatio);
    } else {
      setSpaceBetween(50 * screenRatio);
    }
  }, [viewMode]);

  return (
    <Swiper
      onSwiper={handleSwiper}
      effect="coverflow"
      spaceBetween={spaceBetween}
      slidesPerView={1.55}
      centeredSlides={true}
      coverflowEffect={{
        rotate: 0,
        stretch: 0,
        depth: 250,
        modifier: 1,
        slideShadows: false,
        scale: 0.5,
      }}
      loop={false}
      style={{ height: '100%' }}>
      {items.map((item, index) => {
        return (
          <SwiperSlide
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            {(item.type === PostType.ArtistNote ||
              item.type === PostType.CuratorNote) && (
              <div
                className={styles.card}
                style={{ padding: 40 * screenRatio, gap: 45 * screenRatio }}>
                <p
                  className={styles.type}
                  style={{ fontSize: 22 * screenRatio }}>
                  {item.type}
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

            {item.type === PostType.J043Custom && (
              <div
                className={styles.card}
                style={{ padding: 40 * screenRatio, gap: 45 * screenRatio }}>
                <p
                  className={styles.type}
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
                {item.thumbUrls?.length && (
                  <div
                    className={`${styles.thumbnail} ${viewMode === ViewMode.landscape ? styles.landscapeThumbnail : styles.portraitThumbnail}`}>
                    <QueuingImages urls={item.thumbUrls} alt="thumbnail" />
                  </div>
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
                  className={`${styles.type} ${styles.capitalizedFirstChar}`}
                  style={{ fontSize: 22 * screenRatio }}>
                  {item.type === PostType.WhitePaper
                    ? 'White paper'
                    : item.type}
                </p>
                {item.thumbUrls?.length && (
                  <div className={styles.thumbnail}>
                    <QueuingImages urls={item.thumbUrls} alt="thumbnail" />
                  </div>
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
          </SwiperSlide>
        );
      })}
    </Swiper>
  );
};

export default Carousel;
