const MessageModal = ({
  screenRatio,
  message,
}: {
  screenRatio: number;
  message: string;
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        zIndex: 2,
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
          padding: screenRatio * 100,
          borderRadius: 20,
          textAlign: 'center',
        }}>
        <p style={{ fontSize: screenRatio * 36 }}>{message}</p>
      </div>
    </div>
  );
};

export default MessageModal;
