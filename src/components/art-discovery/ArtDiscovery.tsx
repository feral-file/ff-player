'use client';

import { CastingArtworkType } from '@/models/metric.model';
import styles from './art-discovery-styles.module.scss';
import Controls from './controls/Controls';
import DisplayInfo from './display-info/Info';
import { IndexerToken } from '@/models';

interface ArtDiscoveryProps {
  castingType: CastingArtworkType;
  isCastingSingleArt: boolean;
  token?: IndexerToken; // Required if "isCastingSingleArt" is true
  ffArtworkID?: string; // Required if "isCastingSingleArt" is true and for FF art only
  dailyNote?: string; // Required if "isCastingSingleArt" is true and for Daily art only
}

const ArtDiscovery: React.FC<ArtDiscoveryProps> = ({
  castingType,
  isCastingSingleArt,
  token,
  ffArtworkID,
  dailyNote,
}) => {
  return (
    <div className={styles.container}>
      {isCastingSingleArt && token && (
        <DisplayInfo
          ffArtworkID={ffArtworkID}
          token={token}
          isDaily={castingType === CastingArtworkType.Daily}
          dailyNote={dailyNote}
        />
      )}
      {/* <Controls /> */}
    </div>
  );
};

export default ArtDiscovery;
