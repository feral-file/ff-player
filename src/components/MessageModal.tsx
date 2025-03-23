import { MessageModalType } from '@/utils/types';
import { useEffect, useState } from 'react';

const MessageModal = ({
  screenRatio,
  message,
  messageModalType,
  title,
}: {
  screenRatio: number;
  message?: string;
  messageModalType?: MessageModalType;
  title?: string;
}) => {
  const [backgroundColor, setBackgroundColor] = useState('#2E2E2E');

  useEffect(() => {
    switch (messageModalType) {
      case MessageModalType.error:
        setBackgroundColor('#FF0000');
        break;
      case MessageModalType.warning:
        setBackgroundColor('#FFA500');
        break;
      case MessageModalType.info:
        setBackgroundColor('#2E2E2E');
        break;
      default:
        setBackgroundColor('#2E2E2E');
        break;
    }
  }, [messageModalType]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 99,
        backgroundColor: 'rgba(0, 0, 0, 0.80)',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 10%',
      }}>
      <div
        style={{
          width: '100%',
          height: 'fit-content',
          backgroundColor: backgroundColor,
          padding: screenRatio * 100,
          borderRadius: 20,
          textAlign: 'center',
          display: 'flex',
          columnGap: screenRatio * 20,
          justifyContent: 'center',
        }}>
        {messageModalType === MessageModalType.error && (
          <img src="/images/close-white.svg" alt="close"></img>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: screenRatio * 30,
            color: '#ffffff',
          }}>
          {title && <p style={{ fontSize: screenRatio * 36 }}>{title}</p>}
          {message && (
            <p
              style={{
                fontSize: screenRatio * 24,
                textAlign: 'left',
              }}
              dangerouslySetInnerHTML={{ __html: message }}></p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageModal;
