import styles from './styles.module.scss';
import Image from 'next/image';

export default function Loading() {
  return (
    <div className={styles.loading}>
      <div className={styles['loading-item ']}>
        <div className={styles.image}>
          <Image
            src="/ff-loading-still-v2.svg"
            width={430}
            height={288}
            objectFit="contain"
            alt="Loading"></Image>
        </div>
        <p
          style={{
            fontSize: 28,
            marginTop: 16,
          }}>
          Loading
        </p>
      </div>
    </div>
  );
}
