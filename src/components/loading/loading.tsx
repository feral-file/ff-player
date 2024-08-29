import styles from './styles.module.scss';

export default function Loading() {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingContainer}>
        <div>
          <p>Loading...</p>
          <div className={styles.loader}></div>
        </div>
      </div>
    </div>
  );
}
