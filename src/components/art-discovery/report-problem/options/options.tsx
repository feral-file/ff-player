import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import styles from './options-styles.module.scss';
import FocusableLeaf from '../../components/focusable-leaf/focusable-leaf';

enum ReasonOption {
  Lagging = 'Lagging',
  Ratio = 'Aspect Ratio',
  Other = 'Other issues',
}

const ReasonOptions: React.FC<{
  onSubmitted?: () => void;
}> = ({ onSubmitted }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<ReasonOption>(
    ReasonOption.Lagging
  );

  return (
    <>
      <div className={styles.list}>
        {Object.values(ReasonOption).map(option => (
          <FocusableLeaf
            key={option}
            focusKey={option}
            onEnterPress={() => {
              setSelectedOption(option);
            }}>
            <Option
              option={option}
              selected={selectedOption === option}></Option>
          </FocusableLeaf>
        ))}
      </div>
      <div className={styles.submitBtn}>
        <FocusableLeaf key={'submit-btn'} focusKey={'submit-btn'}>
          <SubmitButton></SubmitButton>
        </FocusableLeaf>
      </div>
    </>
  );
};

export default ReasonOptions;

const Option: React.FC<{
  option: ReasonOption;
  focused?: boolean;
  selected?: boolean;
}> = ({ option, focused, selected }) => {
  return (
    <>
      <div className={clsx(styles.outline, focused && styles.focused)}>
        <div
          className={clsx(
            styles.option,
            focused && styles.focused,
            selected && !focused && styles.selected
          )}>
          <p className={styles.optValue}>{option}</p>
        </div>
      </div>
    </>
  );
};

const SubmitButton: React.FC<{ focused?: boolean }> = ({ focused }) => {
  return (
    <>
      <div className={styles.submit}>
        <div className={styles.sendLogIcon}>
          <img src="/images/send-log.svg" alt="send log" />
        </div>
        <p style={{ fontSize: '1.8em' }}>Report Problem</p>
      </div>
    </>
  );
};
