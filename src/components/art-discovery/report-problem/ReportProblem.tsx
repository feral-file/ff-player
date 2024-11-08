'use client';

import styles from './report-styles.module.scss';
import { useRef, useState } from 'react';
import FocusableContainer from '../components/focusable-container/focusable-container';
import ReasonOptions from './options/options';
import { SupportService } from '@/services/support.service';
import QRCode from 'qrcode.react';
import { useAppContext } from '@/context/AppContext';

const ReportProblem: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [branchLink, setBranchLink] = useState('');
  const supportService = useRef(new SupportService());
  const { context } = useAppContext();
  const { screenRatio } = context.deviceRotation ?? {
    screenRatio: 1,
  };

  const submittedHandler = async (reportID: string) => {
    if (!reportID) {
      return;
    }

    setIsSubmitted(true);
    try {
      const link =
        await supportService.current.generateSupportConnectionLink(reportID);
      setBranchLink(link ?? '');
    } catch (error) {
      console.error('Error getting branch link', error);
    }
  };

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
                <p className={styles.title}>
                  <span style={{ fontSize: '4em', lineHeight: '120%' }}>
                    Report Submitted
                  </span>
                </p>
                <p className={styles.subTitle}>
                  <span className={styles.subText}>Stay Updated</span>
                </p>
                <div className={styles.description}>
                  <p className={styles.subText}>
                    Scan the QR code below to link this report to your mobile
                    app. You can track its status, and we’ll notify you when the
                    issue is resolved.
                  </p>
                </div>
                <div className={styles.qrCode}>
                  {branchLink && (
                    <QRCode
                      value={branchLink}
                      size={screenRatio * 250}
                      bgColor={'transparent'}
                      fgColor={'#000000'}></QRCode>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.submitState}>
                <p className={styles.title}>
                  <span style={{ fontSize: '4em' }}>Submit Report</span>
                </p>
                <p className={styles.subTitle}>
                  <span className={styles.subText}>
                    Help Us Understand the Problem
                  </span>
                </p>
                <div className={styles.description}>
                  <p className={styles.subText}>
                    We will investigate, but providing more details will help us
                    resolve it faster.
                    <br />
                    What issue did you encounter?
                  </p>
                </div>
                <div className={styles.issueList}>
                  <FocusableContainer
                    className={styles.optionsDrawerContainer}
                    initialFocusKey={'issueOptions'}>
                    <ReasonOptions
                      onSubmitted={submittedHandler}></ReasonOptions>
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
