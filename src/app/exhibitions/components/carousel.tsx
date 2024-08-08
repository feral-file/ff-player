import { Post, PostType } from "@/models";
import { SwiperOptions } from "swiper/types";
import Swiper from "swiper";
import "swiper/scss";
import "swiper/scss/effect-coverflow";
import "swiper/scss/effect-fade";
import styles from "./carousel.module.scss";
import { formatDateTime } from "@/utils/ui/formatDate";
import { useEffect, useState } from "react";
import { setTimeout } from "timers";

interface CarouselProps {
  items: Post[];
  index: number;
  onLoad: boolean;
}

const Carousel: React.FC<CarouselProps> = ({ items, index, onLoad }) => {
  const [loading, setLoading] = useState(true);
  const swiperParams: SwiperOptions = {
    effect: "coverflow",
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
    loop: true,
  };
  let swiper: Swiper;

  useEffect(() => {
    for (const item of items) {
      if (item.dateTime) {
        const { date, time } = formatDateTime(item.dateTime);
        item.date = date;
        item.time = time;
      }
    }
  }, [items]);

  useEffect(() => {
    if (!swiper) {
      swiper = new Swiper(".swiper", swiperParams);
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
    <div className="swiper" style={{ height: "100%" }}>
      <div className="swiper-wrapper">
        {items.map((item, index) => (
          <div
            key={index}
            className="swiper-slide"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {item.type === PostType.Note && (
              <div className={styles.card}>
                <p className={styles.type}>Curators note</p>
                <p className={styles.postTitle}>{item.title}</p>
                <p
                  className={styles.content}
                  dangerouslySetInnerHTML={{ __html: item.content! }}
                ></p>
              </div>
            )}

            {item.type === PostType.CloseUp && (
              <div className={styles.card}>
                <p className={styles.type}>Close up</p>
                <img src={item.coverURI} alt="close up thumbnail" />
                <p className={styles.postTitle}>{item.title}</p>
                {item.author && (
                  <p className={styles.subContent}>by {item.author}</p>
                )}
              </div>
            )}

            {[PostType.Event, PostType.News].includes(item.type) && (
              <div className={styles.card}>
                <p className={styles.type}>
                  {item.type === PostType.Event ? "Event" : "News"}
                </p>
                <img src={item.coverURI} alt="event thumbnail" />
                <p className={styles.postTitle}>{item.title}</p>
                {item.date && (
                  <p className={styles.content}>Date: {item.date}</p>
                )}
                {item.time && (
                  <p className={styles.content}>Time: {item.time}</p>
                )}
                {item.author && (
                  <p className={styles.subContent}>by {item.author}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Carousel;
