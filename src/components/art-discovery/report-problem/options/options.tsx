import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import styles from './options-styles.module.scss';
import FocusableLeaf from '../../components/focusable-leaf/focusable-leaf';
import {
  SupportRequestReason,
  SupportService,
} from '@/services/support.service';
import { usePopUpContext } from '@/context/PopUpContext';
import { useAppContext } from '@/context/AppContext';
import { ArtFraming } from '@/services/AppControls';
import { Orientation } from '@/utils/types';
import DeviceManager from '@/utils/DeviceManager';

const ReasonOptions: React.FC<{
  onSubmitted: (resp: string) => Promise<void>;
}> = ({ onSubmitted }) => {
  const { displayInfo, artDisplaySetting } = usePopUpContext();
  const { context } = useAppContext();
  const deviceRotation = context.deviceRotation;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SupportRequestReason>(
    SupportRequestReason.Lagging
  );
  const supportService = useRef(new SupportService());

  const submitReport = async () => {
    try {
      if (isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      const deviceInfo = await getDeviceInfo();
      const data = await supportService.current.submitSupportRequest(
        displayInfo?.token?.indexID ?? displayInfo?.indexID ?? '',
        [selectedOption],
        deviceInfo
      );

      setIsSubmitting(false);
      await onSubmitted(data?.reportID ?? '');
    } catch (error) {
      setIsSubmitting(false);
      console.log('Error submitting report:', error);
    }
  };

  const getDeviceInfo = async () => {
    const currentArtDisplaySetting = {
      'art framing':
        Object.values(ArtFraming)[artDisplaySetting?.frameConfig ?? 0],
      'art rotation angle': `${(artDisplaySetting?.rotateRadius ?? 0).toString()} degrees`,
      'app rotation angle': `${(deviceRotation?.rotateRadius ?? 0).toString()} degrees`,
      'screen orientation':
        deviceRotation?.screenOrientation === Orientation.horizontal
          ? 'landscape'
          : 'portrait',
    };

    const deviceInfo = await DeviceManager.getDeviceInfo(true);
    if (!deviceInfo) {
      return currentArtDisplaySetting;
    }

    return { ...deviceInfo, ...currentArtDisplaySetting };
  };

  return (
    <>
      <div className={styles.list}>
        {Object.values(SupportRequestReason).map(option => (
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
        <FocusableLeaf
          key={'submit-btn'}
          focusKey={'submit-btn'}
          onEnterPress={() => {
            submitReport().catch((err: unknown) => {
              console.error('Error submitting report:', err);
            });
          }}>
          <SubmitButton isSubmitting={isSubmitting}></SubmitButton>
        </FocusableLeaf>
      </div>
    </>
  );
};

export default ReasonOptions;

const Option: React.FC<{
  option: SupportRequestReason;
  focused?: boolean;
  selected?: boolean;
}> = ({ option, focused, selected }) => {
  return (
    <div className={clsx(styles.outline, focused && styles.focused)}>
      <style jsx>{`
        .active {
          > div > p {
            background-color: #819fb2;
          }
        }
      `}</style>
      <div
        className={clsx(
          styles.option,
          focused && styles.focused,
          selected && !focused && styles.selected
        )}>
        <p className={styles.optValue}>
          <span style={{ fontSize: '1.5em' }}>{option}</span>
        </p>
      </div>
    </div>
  );
};

const SubmitButton: React.FC<{ focused?: boolean; isSubmitting?: boolean }> = ({
  focused,
  isSubmitting,
}) => {
  return (
    <div
      className={clsx(
        styles.submit,
        focused && styles.focused,
        isSubmitting && styles.active
      )}>
      <style jsx>{`
        .active {
          background-color: #a5b305;
        }
      `}</style>
      <div className={styles.sendLogIcon}>
        <img src="/images/send-log.svg" alt="send log" />
      </div>
      <p style={{ fontSize: '1.8em' }}>Report Problem</p>
    </div>
  );
};
