import Image from 'next/image';
import styles from './styles.module.scss';
import clsx from 'clsx';

export enum MicrophoneState {
  Active,
  Inactive,
}

export default function Microphone({
  onClick,
  state,
}: {
  onClick: (e: unknown) => void;
  state: MicrophoneState | undefined;
}) {
  return (
    <>
      <button
        className={clsx(
          styles.microphoneContainer,
          state === MicrophoneState.Active && styles.active
        )}
        onClick={onClick}>
        <Image
          src={'/images/microphone-inactive.svg'}
          alt="fullscreen"
          width={27}
          height={43}
        />
      </button>
    </>
  );
}
