// Handles all the complex CORS logic
// - Checks trusted origins
// - Attempts blob conversion
// - Falls back to direct loading
// - Manages object URLs
// - Logs errors through the player-wide console stream

import { KNOWN_ORIGINS } from '@/constants';

export type BlobLoadedMediaType = 'image' | 'video' | 'audio' | 'object';

export type MediaElement =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLAudioElement;

export interface MediaLoadOptions {
  url: string;
  mediaType: BlobLoadedMediaType;
  element: MediaElement;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export interface MediaLoadResult {
  success: boolean;
  usedBlob: boolean;
  error?: Error;
}

const abortResult = (): MediaLoadResult => ({
  success: false,
  usedBlob: false,
  error: new DOMException('Media load aborted', 'AbortError'),
});

/** Assigns the original media URL and converts thrown values into a result. */
function loadDirect(options: MediaLoadOptions): MediaLoadResult {
  const { element, mediaType, onError, signal, url } = options;
  if (signal?.aborted) {
    return abortResult();
  }
  try {
    setMediaSource(element, mediaType, url);
    return { success: true, usedBlob: false };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    onError?.(failure);
    return { success: false, usedBlob: false, error: failure };
  }
}

/** Tries a CORS blob conversion and falls back to the original URL. */
async function loadViaBlob(
  options: MediaLoadOptions
): Promise<MediaLoadResult> {
  const { element, mediaType, signal, url } = options;
  try {
    console.log(
      `[MediaLoader] Fetching ${mediaType} for blob conversion:`,
      url
    );
    const response = await fetch(url, {
      mode: 'cors',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${String(response.status)}: ${response.statusText}`
      );
    }
    if (signal?.aborted) {
      return abortResult();
    }

    const objectURL = URL.createObjectURL(await response.blob());
    if (signal?.aborted) {
      URL.revokeObjectURL(objectURL);
      return abortResult();
    }
    setMediaSource(element, mediaType, objectURL);
    console.log(
      `[MediaLoader] Successfully converted ${mediaType} to blob URL`
    );
    return { success: true, usedBlob: true };
  } catch (error) {
    console.error(
      `[MediaLoader] Error fetching ${mediaType} for blob conversion:`,
      error
    );
    if (error instanceof DOMException && error.name === 'AbortError') {
      return abortResult();
    }
    console.log(
      `[MediaLoader] Falling back to direct loading for ${mediaType}`
    );
    return loadDirect(options);
  }
}

/**
 * Universal CORS handling for all media types
 * Handles trusted origins with direct loading and unknown origins with blob conversion.
 */
export const loadMediaWithCORS = async (
  options: MediaLoadOptions
): Promise<MediaLoadResult> => {
  const { url, mediaType, signal } = options;
  if (signal?.aborted) {
    return abortResult();
  }

  const origin = (() => {
    try {
      return new URL(url, window.location.href).origin;
    } catch {
      return null;
    }
  })();

  // For trusted origins, load directly
  const isTrustedOrigin = origin && KNOWN_ORIGINS.has(origin);
  if (isTrustedOrigin) {
    console.log(
      `[MediaLoader] Loading ${mediaType} from trusted origin:`,
      origin
    );

    return loadDirect(options);
  }

  const supportsBlobConversion =
    mediaType === 'image' || mediaType === 'object' || mediaType === 'video';

  if (!supportsBlobConversion) {
    return loadDirect(options);
  }

  return loadViaBlob(options);
};

/**
 * Sets the appropriate source attribute based on media type.
 */
const setMediaSource = (
  element: MediaElement,
  mediaType: BlobLoadedMediaType,
  source: string
): void => {
  if (mediaType === 'image') {
    (element as HTMLImageElement).src = source;
  } else if (mediaType === 'video') {
    (element as HTMLVideoElement).src = source;
  } else if (mediaType === 'audio') {
    (element as HTMLAudioElement).src = source;
  }
};

/**
 * Creates a media loader hook for React components.
 */
export const createMediaLoader = () => {
  let currentObjectURL: string | null = null;

  const loadMedia = async (
    options: MediaLoadOptions
  ): Promise<MediaLoadResult> => {
    // Clean up previous object URL
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }

    const result = await loadMediaWithCORS(options);
    console.log('[MediaLoader] result', result);
    // Track object URL for cleanup
    if (result.success && result.usedBlob) {
      const element = options.element;
      if (options.mediaType === 'image') {
        currentObjectURL = (element as HTMLImageElement).src;
      } else if (options.mediaType === 'video') {
        currentObjectURL = (element as HTMLVideoElement).src;
      } else if (options.mediaType === 'audio') {
        currentObjectURL = (element as HTMLAudioElement).src;
      }
    }

    return result;
  };

  const cleanup = () => {
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
  };

  return { loadMedia, cleanup };
};
