// Handles all the complex CORS logic
// - Checks trusted origins
// - Attempts blob conversion
// - Falls back to direct loading
// - Manages object URLs
// - Logs errors to Sentry

import * as Sentry from '@sentry/nextjs';
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

/**
 * Universal CORS handling for all media types
 * Handles trusted origins with direct loading and unknown origins with blob conversion
 */
export const loadMediaWithCORS = async (
  options: MediaLoadOptions
): Promise<MediaLoadResult> => {
  const { url, mediaType, element, onError, signal } = options;

  const isAborted = () => signal?.aborted ?? false;
  const abortResult = (): MediaLoadResult => ({
    success: false,
    usedBlob: false,
    error: new DOMException('Media load aborted', 'AbortError'),
  });

  if (isAborted()) {
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

    try {
      if (isAborted()) {
        return abortResult();
      }
      setMediaSource(element, mediaType, url);
      return { success: true, usedBlob: false };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      return { success: false, usedBlob: false, error: err };
    }
  }

  const supportsBlobConversion =
    mediaType === 'image' || mediaType === 'object' || mediaType === 'video';

  if (!supportsBlobConversion) {
    // For media types that require streaming (video/audio), fall back to direct loading.
    try {
      if (isAborted()) {
        return abortResult();
      }
      setMediaSource(element, mediaType, url);
      return { success: true, usedBlob: false };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      return { success: false, usedBlob: false, error: err };
    }
  }

  // For unknown origins that support blob conversion (images/objects), try blob conversion
  try {
    console.log(
      `[MediaLoader] Fetching ${mediaType} for blob conversion:`,
      url
    );

    const res = await fetch(url, {
      mode: 'cors',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${String(res.status)}: ${res.statusText}`);
    }

    if (isAborted()) {
      return abortResult();
    }

    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);

    if (isAborted()) {
      URL.revokeObjectURL(obj);
      return abortResult();
    }

    setMediaSource(element, mediaType, obj);

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

    Sentry.captureMessage(
      `[MediaLoader] Error fetching ${mediaType} for blob conversion`,
      {
        level: 'error',
        extra: {
          error: error instanceof Error ? error.message : String(error),
          url,
          mediaType,
        },
      }
    );

    // Fallback to direct loading
    console.log(
      `[MediaLoader] Falling back to direct loading for ${mediaType}`
    );

    try {
      if (isAborted()) {
        return abortResult();
      }
      setMediaSource(element, mediaType, url);
      return { success: true, usedBlob: false };
    } catch (fallbackError) {
      const err =
        fallbackError instanceof Error
          ? fallbackError
          : new Error(String(fallbackError));
      onError?.(err);
      return { success: false, usedBlob: false, error: err };
    }
  }
};

/**
 * Sets the appropriate source attribute based on media type
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
 * Creates a media loader hook for React components
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
