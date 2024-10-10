'use client';

import { clsx } from 'clsx';
import styles from './report-styles.module.scss';
import { useState } from 'react';
import FocusableContainer from '../components/focusable-container/focusable-container';
import ReasonOptions from './options/options';

const ReportProblem: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className={styles.modal}>
      <div className={styles.border}>
        <div className={styles.radiusLayout}>
          <div className={styles.container}>
            <div className={styles.icon}>
              <img src="/images/problem.svg" alt="report problem" />
            </div>
            {isSubmitted ? (
              <div className={styles.submitState}>
                <p className={styles.title}>Report Submitted</p>
                <p className={styles.subTitle}>Stay Updated</p>
                <p className={styles.description}>
                  Scan the QR code below to link this report to your mobile app.
                  You can track its status, and we’ll notify you when the issue
                  is resolved.
                </p>
                <div className={styles.qrCode}>
                  <img src="" alt="qr code" />
                </div>
              </div>
            ) : (
              <div className={styles.submitState}>
                <p className={styles.title}>Submit Report</p>
                <p className={styles.subTitle}>
                  Help Us Understand the Problem
                </p>
                <p className={styles.description}>
                  We will investigate, but providing more details will help us
                  resolve it faster.
                  <br />
                  What issue did you encounter?
                </p>
                <div className={styles.issueList}>
                  <FocusableContainer
                    className={styles.optionsDrawerContainer}
                    initialFocusKey={'issueOptions'}>
                    <ReasonOptions></ReasonOptions>
                  </FocusableContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default ReportProblem;
