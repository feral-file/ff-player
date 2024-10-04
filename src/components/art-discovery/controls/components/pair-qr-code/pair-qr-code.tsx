'use client';

import QRCode from 'qrcode.react';

const PairQRCode: React.FC = () => {
  return (
    <QRCode
      value="Test value"
      bgColor={'transparent'}
      fgColor={'#ffffff'}
      size={256}></QRCode>
  );
};
export default PairQRCode;
