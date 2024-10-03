'use client';

import { CastingArtworkType } from '@/models/metric.model';
import styles from './art-discovery-styles.module.scss';
import Controls from './controls/Controls';
import DisplayInfo from './display-info/Info';
import { Artwork } from '@/models';

interface ArtDiscoveryProps {
  castingType: CastingArtworkType;
  isCastingSingleArt: boolean;
  artwork?: Artwork; // Required if "isCastingSingleArt" is true
}

const ArtDiscovery: React.FC<ArtDiscoveryProps> = ({
  castingType,
  isCastingSingleArt,
  artwork,
}) => {
  return (
    <div className={styles.container}>
      {isCastingSingleArt && artwork && <DisplayInfo artwork={artwork} />}
      <Controls />
    </div>
  );
};

export default ArtDiscovery;
