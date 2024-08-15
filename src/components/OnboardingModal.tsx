import { AppContext } from '@/context/AppContext';
import QRCode from 'qrcode.react';
import Image from 'next/image';
import { useContext } from 'react';

const OnboardingModal = ({}: {}) => {
  const screenRatio = useContext(AppContext)?.deviceRotation?.screenRatio ?? 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.80)',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 20%',
      }}>
      <div
        style={{
          width: '100%',
          height: 'fit-content',
          backgroundColor: '#2E2E2E',
          padding: screenRatio * 40,
          borderRadius: 20,
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
          1. Open the Feral File app on your <b>{'connectedDeviceName'}</b>.
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
          style={{
            display: 'flex',
            gap: screenRatio * 20,
            alignItems: 'flex-start',
          }}>
          <p style={{ fontSize: screenRatio * 32 }}>
            3. Tap the display button on your <b>{'connectedDeviceName'}</b> to
            display your art on <b>{'displayName'}</b>.
          </p>
          <Image
            src={'/cast-btn.svg'}
            width={100}
            height={100}
            alt="cas-button"></Image>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}>
            <div
              style={{
                padding: 10 * screenRatio,
                backgroundColor: 'white',
                width: 'fit-content',
              }}>
              <QRCode value={'qwieyqwiuey'} size={250 * screenRatio} />
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
