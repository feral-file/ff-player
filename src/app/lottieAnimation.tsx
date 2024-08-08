import React from 'react';
import Lottie from 'react-lottie';
import animationData from '../../public/ff-loading.lottie.json'; // Assuming your JSON file is in the public folder

const LottieAnimation = () => {
  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice',
    },
  };

  return <Lottie options={defaultOptions} />;
};

export default LottieAnimation;