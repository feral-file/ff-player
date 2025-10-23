import { DP1Call, RefManifest } from '@/models/dp1.model';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';
import {
  isContentAddressed,
  sha256hex,
  normalizeHashToHex,
} from '@/utils/helper';

export const DP1Service = {
  async getPlaylist(playlistURL: string): Promise<DP1Call | null> {
    try {
      console.log('[DP1Service] Fetching playlist from:', playlistURL);

      const response = await axios.get<DP1Call>(playlistURL);

      console.log('[DP1Service] Playlist fetched successfully');
      return response.data;
    } catch (error) {
      console.error('[DP1Service] Failed to load playlist:', error);
      Sentry.captureException(error);
      return null;
    }
  },

  async getItemRef(
    itemRefURL: string,
    itemRefHash?: string
  ): Promise<RefManifest | null> {
    try {
      const res = await axios.get<ArrayBuffer>(itemRefURL, {
        responseType: 'arraybuffer',
        headers: { Accept: 'application/json, */*' },
        // Avoid cached, potentially stale bytes (esp. for non-content-addressed URLs)
        transitional: { forcedJSONParsing: false, silentJSONParsing: false },
        timeout: 15000,
      });

      const bytes = new Uint8Array(res.data);
      const contentType = res.headers['content-type'] as string;

      // If non-content-addressed, enforce hash verification (fail closed)
      if (!isContentAddressed(itemRefURL)) {
        if (!itemRefHash)
          throw new Error(
            'REF_HASH_REQUIRED: non-content-addressed ref must include refHash'
          );
        const expectedHex = normalizeHashToHex(itemRefHash);
        const actualHex = await sha256hex(bytes);
        if (actualHex !== expectedHex) {
          throw new Error(
            `HASH_MISMATCH: expected ${expectedHex}, got ${actualHex}`
          );
        }
      }

      const shouldParseJson =
        /\.json($|\?)/i.test(itemRefURL) ||
        /application\/(json|ld\+json)/i.test(contentType);

      let data: RefManifest | null = null;
      if (shouldParseJson) {
        const text = new TextDecoder().decode(bytes);
        try {
          data = JSON.parse(text) as RefManifest;
        } catch (e: unknown) {
          throw new Error(
            `INVALID_JSON: ${e instanceof Error ? e.message : 'parse error'}`
          );
        }
      }

      return data;
    } catch (error) {
      console.error(
        '[DP1Service] Failed to load item ref from:',
        itemRefURL,
        error
      );
      Sentry.captureException(error);
      return null;
    }
  },
};
