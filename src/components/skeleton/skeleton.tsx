import clsx from 'clsx';
import React, { ReactNode } from 'react';

import styles from './skeleton.module.scss';

interface SkeletonProps {
  children: ReactNode;
}

const Skeleton: React.FC<SkeletonProps> = ({ children }) => {
  return <div className={clsx(styles['skeleton-container'])}>{children}</div>;
};

export default Skeleton;

const CommonSkeleton = () => {
  return (
    <Skeleton>
      <div className={styles['skeleton-body']}>
        <div className={styles['skeleton-flex-vertical']}>
          <div className={styles['skeleton-item']}>
            <div className={styles['skeleton-line']}></div>
            <div className={styles['skeleton-line']}></div>
          </div>
        </div>
      </div>
    </Skeleton>
  );
};

export { CommonSkeleton };
