import { useTranslations } from 'next-intl';
import styles from './styles.module.scss';

export default function Loading() {
  const t = useTranslations('Loading');
  return (
    <div className={styles.loading}>
      <div className={styles.loadingContainer}>
        <div>
          <p>{t('loading')}</p>
          <div className={styles.loader}></div>
        </div>
      </div>
    </div>
  );
}
