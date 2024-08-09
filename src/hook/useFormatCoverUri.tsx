import { useMemo } from 'react';

const YOUTUBE_URL = 'https://www.youtube.com';
const YOUTUBE_EMBED_URL = 'https://www.youtube.com/embed';
const YOUTUBE_VIDEO_QUERY_PARAM_KEY = 'v';
const YOUTUBE_THUMBNAIL_URI =
  'https://img.youtube.com/vi/{video-id}/{variant}.jpg';
const MAX_RES_THUMBNAIL_VARIANT = 'maxresdefault';

const useFormatCoverUri = (uri?: string) => {
  return useMemo(() => {
    try {
      if (!uri) {
        return undefined;
      }

      const url = new URL(uri);

      // Check if the URL is a YouTube embed URL
      if (url.hostname === new URL(YOUTUBE_EMBED_URL).hostname) {
        const videoId = url.pathname.split('/')[2]; // Extract the video ID from the embed URL
        if (videoId) {
          return YOUTUBE_THUMBNAIL_URI.replace(
            '{video-id}',
            videoId
          ).replaceAll('{variant}', MAX_RES_THUMBNAIL_VARIANT);
        }
      }

      // Check if the URL is a standard YouTube URL
      if (url.hostname === new URL(YOUTUBE_URL).hostname) {
        const videoId = url.searchParams.get(YOUTUBE_VIDEO_QUERY_PARAM_KEY);
        if (videoId) {
          return YOUTUBE_THUMBNAIL_URI.replace(
            '{video-id}',
            videoId
          ).replaceAll('{variant}', MAX_RES_THUMBNAIL_VARIANT);
        }
      }

      // Return the original URI if it's not a YouTube URL
      return uri;
    } catch (error) {
      return uri;
    }
  }, [uri]);
};

export default useFormatCoverUri;
