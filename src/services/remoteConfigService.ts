import { AppSettings } from '@/constants';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export interface AppRemoteConfig {
  defaultPlaylistURL: string;
}

/**
 * Loads published runtime config for display defaults and falls back to local
 * constants if the remote document is unavailable.
 *
 * Published `display.json` may still contain legacy fields (for example a
 * historical `duration` used by older clients). This service only reads
 * `defaultPlaylistURL` and ignores other keys.
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

      const url = response.data.defaultPlaylistURL;
      if (typeof url === 'string' && url.trim() !== '') {
        return { defaultPlaylistURL: url.trim() };
      }

      return { defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL };
    } catch (error) {
      console.log('[API] Failed to load config:', error);
      Sentry.captureException(error);
      // Return default value if failed to load config
      return {
        defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
      };
    }
  }
}

export default RemoteConfigService;
