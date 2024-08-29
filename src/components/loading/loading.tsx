import styles from './styles.module.scss';

export default function Loading() {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingContainer}>
        <div>
          <div>Loading ...</div>
          <div className={styles.loader}></div>
        </div>
      </div>
    </div>
  );
}
