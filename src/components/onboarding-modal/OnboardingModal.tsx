import { useAppContext } from '@/context/AppContext';
import QRCode from 'qrcode.react';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import { ViewMode } from '@/utils/types';
import styles from './styles.module.scss';
import DeviceManager from '@/utils/DeviceManager';

const OnboardingModal = () => {
  const { context } = useAppContext();
  const { deviceRotation, websocketData } = context ?? {};
  const screenRatio = deviceRotation?.screenRatio ?? 1;
  const viewMode = deviceRotation?.viewMode ?? ViewMode.landscape;
  const connectedDeviceName = websocketData?.castInfo?.deviceInfo?.device_name;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [branchLink, setBranchLink] = useState<string>('');

  useEffect(() => {
    DeviceManager.getName()
      .then(name => {
        setDisplayName(name);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    DeviceManager.getOrGenerateBranchLink()
      .then(url => {
        if (url) {
          setBranchLink(url);
        }
      })
      .catch((error: unknown) => {
        console.log(error);
      });
  }, []);

  return (
    <div
      className={
        viewMode === ViewMode.landscape
          ? styles.landscapeModal
          : styles.portraitModal
      }>
      <div
        className={styles.modalContent}
        style={{
          padding: screenRatio * 40,
        }}>
        <p
          style={{
            fontSize: screenRatio * 22,
            paddingBottom: screenRatio * 45,
          }}>
          What’s Next?
        </p>
        <p
          style={{
            fontSize: screenRatio * 32,
            fontWeight: 'bold',
            paddingBottom: screenRatio * 45,
          }}>{`Let's get you set up quickly to enjoy your art on your display:`}</p>
        <p
          style={{
            fontSize: screenRatio * 32,
            paddingBottom: screenRatio * 45,
          }}>
          1. Open the Feral File app on your <b>{connectedDeviceName}</b>.
        </p>
        <p
          style={{
            fontSize: screenRatio * 32,
            paddingBottom: screenRatio * 45,
          }}>
          2. Select an artwork from your collection, a playlist, or a Feral File
          exhibition.
        </p>
        <div
          className={styles.bottomText}
          style={{
            gap: screenRatio * (viewMode === ViewMode.landscape ? 20 : 45),
          }}>
          <div className={styles.displayText} style={{ gap: screenRatio * 20 }}>
            <p style={{ fontSize: screenRatio * 32 }}>
              3. Tap the display button on your <b>{connectedDeviceName}</b> to
              display your art on <b>{displayName}</b>.
            </p>
            <Image
              src={'/cast-btn.svg'}
              width={76}
              height={58}
              alt="cas-button"></Image>
          </div>
          <div className={styles.qrCodeContainer}>
            <div
              className={styles.qrCode}
              style={{
                padding: 10 * screenRatio,
              }}>
              <QRCode value={branchLink} size={250 * screenRatio} />
            </div>
            <p
              style={{
                fontSize: screenRatio * 22,
                whiteSpace: 'nowrap',
                paddingTop: screenRatio * 20,
              }}>
              Scan to connect another device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
