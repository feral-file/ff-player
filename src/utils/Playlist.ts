import { PlaylistToken } from "./types";

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
