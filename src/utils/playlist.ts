import { DP1Item } from '@/models/dp1.model';

export function getIndex(playlistItems: DP1Item[], startTime: number): number {
  // Return first artwork if duration is 0
  let index = 0;
  const currentTime = Date.now();
  let elapsedTime = currentTime - startTime;

  const totalDuration = playlistItems.reduce(
    (acc, artwork) => acc + (artwork.duration || 0) * 1000,
    0
  );

  elapsedTime = elapsedTime % totalDuration;

  for (let i = 0; i < playlistItems.length; i++) {
    const artwork = playlistItems[i];
    elapsedTime -= (artwork.duration || 0) * 1000;
    if (elapsedTime < 0) {
      index = i;
      break;
    }
  }

  return index;
}

export function calculateStartTime(
  dp1Items: DP1Item[],
  index: number,
  elapsedTime?: number
): number {
  let startTime = new Date().setMilliseconds(0);
  for (let i = 0; i < index; i++) {
    startTime -= (dp1Items[i].duration || 0) * 1000;
  }

  if (elapsedTime) {
    startTime -= elapsedTime;
  }

  return startTime;
}

export function getArtworkStartTime(
  dp1Items: DP1Item[],
  index: number,
  playlistStartTime: number
): number {
  // Start with the playlist's start time
  let artworkStartTime = playlistStartTime;

  // Add the duration of all previous artworks
  for (let i = 0; i < index; i++) {
    artworkStartTime += (dp1Items[i].duration || 0) * 1000;
  }

  return artworkStartTime;
}
