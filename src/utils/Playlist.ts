import { PlayArtwork, PlaylistToken } from '@/models';

export function getIndex(
  playlistTokens: PlaylistToken[],
  startTime: number
): number {
  // Return first artwork if duration is 0
  let index = 0;
  const currentTime = Date.now();
  let elapsedTime = currentTime - startTime;

  const totalDuration = playlistTokens.reduce(
    (acc, artwork) => acc + artwork.duration || 0,
    0
  );

  elapsedTime = elapsedTime % totalDuration;

  for (let i = 0; i < playlistTokens.length; i++) {
    const artwork = playlistTokens[i];
    elapsedTime -= artwork.duration || 0;
    if (elapsedTime < 0) {
      index = i;
      break;
    }
  }

  return index;
}

export function calculateStartTime(
  artworks: PlayArtwork[],
  index: number,
  elapsedTime?: number
): number {
  let startTime = new Date().setMilliseconds(0);
  for (let i = 0; i < index; i++) {
    startTime -= artworks[i].duration || 0;
  }

  if (elapsedTime) {
    startTime -= elapsedTime;
  }

  return startTime;
}

export function getArtworkStartTime(
  playlist: PlayArtwork[],
  index: number,
  playlistStartTime: number
): number {
  // Start with the playlist's start time
  let artworkStartTime = playlistStartTime;

  // Add the duration of all previous artworks
  for (let i = 0; i < index; i++) {
    artworkStartTime += playlist[i].duration || 0;
  }

  return artworkStartTime;
}
