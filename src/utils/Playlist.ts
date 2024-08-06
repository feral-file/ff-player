import { PlaylistToken } from "./types";

export function getIndex(
  playlistTokens: PlaylistToken[],
  startTime: number
): number {
  let index = -1;
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
