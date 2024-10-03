'use client';

import { clsx } from 'clsx';
import styles from './info-styles.module.scss';
import { Artwork } from '@/models';

// Display information overlay, detail for daily artwork casting only
const DisplayInfo: React.FC<{ artwork: Artwork }> = ({ artwork }) => {
  return (
    <div className={styles['main-content']}>
      <div className={clsx(styles.item, styles['short-artwork-info'])}>
        <p>Shunsuke Takawo</p>
        <p>Flows of Pattern 2024</p>
      </div>
      <div
        className={clsx(
          styles.item,
          styles['full-artwork-info'],
          styles.active
        )}>
        <h1>Daily</h1>
        <hr />
        <div>
          <div>
            <p>Shunsuke Takawo</p>
            <p>Flows of Pattern</p>
          </div>
          <div></div>
        </div>
        <div>
          <p>
            Custom software (color, silent) Dimensions variable, vertical
            Generative, non-interactive JavaScript (p5.js), HTML, CSS
          </p>
        </div>
        <p>
          Shunsuke Takawo regards geometrical motifs as well-suited to
          reflecting daily life and expressing his inner world through
          programming. For many years, he has explored static elements such as
          color, shape, harmony, shadow, density, layering, and texture, while
          his explorations of composition are rooted in his mothers quilting.
          His work, Flows of Pattern, is influenced by Hiroshi Kawanos vision of
          social transformation through aesthetics as well as his 1969 work,
          Simulated Color Mosaic.
        </p>
        <div className={styles['read-more-container']}>
          <img src={'/images/read-more.svg'} alt="read more" />
          <p>Press OK to Read More</p>
        </div>
      </div>
    </div>
  );
};

export default DisplayInfo;
