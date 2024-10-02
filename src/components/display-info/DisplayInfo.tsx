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
            His work, Flows of Pattern, is influenced by Hiroshi Kawanos vision
            of social transformation through aesthetics as well as his 1969
            work, Simulated Color Mosaic.
          </p>
          <div className={styles['read-more-container']}>
            <img src={'/images/read-more.svg'} alt="read more" />
            <p>Press OK to Read More</p>
          </div>
        </div>
        <div className={clsx(styles.item, styles['short-display-control'])}>
          <div className={styles['left-content']}>
            <img src={'/images/ff-icon.svg'} alt="icon" />
            <img src="" alt="" />
            <p>Next Artwork: 10min</p>
          </div>
          <div>
            <p>Press [back] to Hide</p>
          </div>
        </div>
        <div className={clsx(styles.item, styles['full-display-control'])}>
          <div>
            <img src={'/images/ff-logo.svg'} alt="logo" />
          </div>
          <div>
            <div>
              <div>
                <img src={'/images/display-preferences-white.svg'} alt="" />
                <p>Display Preferences</p>
              </div>
              <div>
                <img src={'/images/display-rotation-white.svg'} alt="" />
                <p>Display Rotation</p>
              </div>
              <div>
                <img src={'/images/pair-mobil-app-white.svg'} alt="" />
                <p>Pair Mobile App</p>
              </div>
            </div>
            <div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisplayInfo;
