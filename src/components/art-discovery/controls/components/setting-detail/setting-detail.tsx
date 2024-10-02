import React from 'react';
import styles from './setting-detail-styles.module.scss';

const SettingDetail: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => {
  return (
    <>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>
        {formatStringWithNewlines(description)}
      </p>
      <div className={styles.action}>{children}</div>
    </>
  );
};

function formatStringWithNewlines(str: string) {
  const lines = str.split('\\n');
  return lines.map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

export default SettingDetail;
