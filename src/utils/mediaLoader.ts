// Loads native artwork media into its element and reports load progress.
//
// Images are read as a CORS stream and handed to the <img> as a blob:
// - The CORS-mode request is what feral-file/ff-player#204 needs: some
//   CDNs/WAFs answer the no-cors request a plain <img src> makes with 403 but
//   serve CORS requests.
// - Reading the body as a stream is the only way script can see an image's
//   transfer progress; <img> exposes none. The stuck-load watchdog
//   (LoadWatchdog) needs that signal to tell a slow transfer from a dead one.
// - The element only receives complete bytes, so a still never paints in
//   partially.
// Every artwork origin was verified to answer CORS; one that does not falls
// back to the plain element load below, at the cost of one failed request.
//
// Video and audio always load directly. Their elements already send CORS
// requests (crossOrigin="anonymous"), stream with Range, and fire `progress`
// events; reading them into a blob would hold a whole video in memory and
// delay the first frame until the last byte.
//
// Log lines keep the "[MediaLoader]" prefix: feral-controld forwards player
// logs by an allowlist of component prefixes (hub/player_logs.go).

export type BlobLoadedMediaType = 'image' | 'video' | 'audio';

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
  /** Called for every chunk of an image body the loader receives. */
  onProgress?: () => void;
  /**
   * Called when an image's bytes are complete and handed to the element
   * (`decode`), or when the loader fell back to a plain element load whose
   * progress it cannot see (`opaque`).
   */
  onPhase?: (phase: 'decode' | 'opaque') => void;
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

/** True for a fetch or loader cancelled through its AbortSignal. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Assigns the original media URL and converts thrown values into a result. */
function loadDirect(options: MediaLoadOptions): MediaLoadResult {
  const { element, onError, signal, url } = options;
  if (signal?.aborted) {
    return abortResult();
  }
  try {
    element.src = url;
    return { success: true, usedBlob: false };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    onError?.(failure);
    return { success: false, usedBlob: false, error: failure };
  }
}

/** An HTTP error status, as opposed to a request the browser refused or lost. */
class HTTPStatusError extends Error {}

/**
 * Fetches `url` and collects its body into a Blob, reporting each chunk.
 * Piping through a counting stream lets the browser assemble the Blob itself
 * rather than this code buffering every chunk a second time.
 */
async function fetchBlob(
  options: MediaLoadOptions,
  cache: RequestCache
): Promise<Blob> {
  const { url, signal, onProgress } = options;
  const response = await fetch(url, {
    mode: 'cors',
    cache,
    referrerPolicy: 'no-referrer',
    signal,
  });
  if (!response.ok) {
    throw new HTTPStatusError(
      `HTTP ${String(response.status)}: ${response.statusText}`
    );
  }
  onProgress?.();
  if (!response.body) {
    return response.blob();
  }
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onProgress?.();
        controller.enqueue(chunk);
      },
    })
  );
  const type = response.headers.get('Content-Type') ?? '';
  return new Response(counted, { headers: { 'Content-Type': type } }).blob();
}

/**
 * Reads an image through the HTTP cache, so a retry or the next loop of a
 * playlist reuses bytes it already has. A cached response stored by a
 * request without CORS headers can make Chromium reject the CORS read (see
 * helper.ts's getContentTypeFromURL note); that surfaces as a TypeError, so
 * one `reload` attempt bypasses and replaces that entry before giving up.
 */
async function fetchImageBlob(options: MediaLoadOptions): Promise<Blob> {
  try {
    return await fetchBlob(options, 'default');
  } catch (error) {
    if (isAbort(error) || error instanceof HTTPStatusError) {
      throw error;
    }
    console.log('[MediaLoader] Retrying image without the HTTP cache');
    return fetchBlob(options, 'reload');
  }
}

/** Streams an image into a blob URL and falls back to the original URL. */
async function loadImageViaStream(
  options: MediaLoadOptions
): Promise<MediaLoadResult> {
  const { element, signal, url, onPhase } = options;
  try {
    console.log('[MediaLoader] Streaming image:', url);
    const objectURL = URL.createObjectURL(await fetchImageBlob(options));
    if (signal?.aborted) {
      URL.revokeObjectURL(objectURL);
      return abortResult();
    }
    element.src = objectURL;
    onPhase?.('decode');
    console.log('[MediaLoader] Image bytes complete');
    return { success: true, usedBlob: true };
  } catch (error) {
    if (isAbort(error) || signal?.aborted) {
      return abortResult();
    }
    console.error('[MediaLoader] Error streaming image:', error);
    console.log('[MediaLoader] Falling back to direct loading for image');
    const result = loadDirect(options);
    if (result.success) {
      onPhase?.('opaque');
    }
    return result;
  }
}

/** Loads one artwork element; see the module comment for the per-type paths. */
export const loadMediaWithCORS = async (
  options: MediaLoadOptions
): Promise<MediaLoadResult> => {
  if (options.signal?.aborted) {
    return abortResult();
  }
  if (options.mediaType === 'image') {
    return loadImageViaStream(options);
  }
  return loadDirect(options);
};

/**
 * Creates a per-slot loader that owns the blob URL of its latest image.
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
    if (result.success && result.usedBlob) {
      currentObjectURL = options.element.src;
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
