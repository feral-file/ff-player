'use client';

import { clsx } from 'clsx';
import styles from './styles.module.scss';

const DisplayInfo = () => {
  return (
    <div className={styles.container}>
      <div className={styles['main-content']}>
        <div className={clsx(styles.item, styles['short-artwork-info'])}>
          <p>Shunsuke Takawo</p>
          <p>Flows of Pattern 2024</p>
        </div>
        <div className={clsx(styles.item, styles['full-artwork-info'])}>
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
            His work, Flows of Pattern, is influenced by Hiroshi Kawanos vision
            of social transformation through aesthetics as well as his 1969
            work, Simulated Color Mosaic.
          </p>
          <div>
            <p>Press OK to Read More</p>
          </div>
        </div>
        <div className={clsx(styles.item, styles['short-display-control'])}>
          <p>cccc</p>
        </div>
        <div className={clsx(styles.item, styles['full-display-control'])}>
          <p>dddd</p>
        </div>
      </div>
    </div>
  );
};

export default DisplayInfo;
