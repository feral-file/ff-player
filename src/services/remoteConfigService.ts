import { AppSettings } from '@/constants';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export interface AppRemoteConfig {
  duration: number;
  defaultPlaylistURL: string;
}

/**
 * Loads published runtime config for display defaults and falls back to local
 * constants if the remote document is unavailable or incomplete.
 *
 * Published `display.json` may still contain legacy fields (for example a
 * historical `duration` used by older clients). This service accepts that
 * field for version polling, but only `defaultPlaylistURL` affects fallback
 * playback selection.
 */
class RemoteConfigService {
  private appRemoteConfig: AppRemoteConfig | null = null;

  public async getAppRemoteConfig() {
    this.appRemoteConfig ??= await this.fetchConfig();

    return this.appRemoteConfig;
  }

  private async fetchConfig(): Promise<AppRemoteConfig> {
    try {
      const response = await axios.get<Partial<AppRemoteConfig>>(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/display.json`
      );

      return {
        duration:
          typeof response.data.duration === 'number' && response.data.duration > 0
            ? response.data.duration
            : AppSettings.VERSION_CHECK_INTERVAL_DURATION,
        defaultPlaylistURL:
          typeof response.data.defaultPlaylistURL === 'string' &&
          response.data.defaultPlaylistURL.trim() !== ''
            ? response.data.defaultPlaylistURL.trim()
            : AppSettings.DEFAULT_PLAYLIST_URL,
      };
    } catch (error) {
      console.log('[API] Failed to load config:', error);
      Sentry.captureException(error);
      // Return default value if failed to load config
      return {
        duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
        defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
      };
    }
  }
}

export default RemoteConfigService;
