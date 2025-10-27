import { AppSettings } from '@/constants';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export interface AppRemoteConfig {
  duration: number;
  defaultPlaylistURL: string;
}

class RemoteConfigService {
  private appRemoteConfig: AppRemoteConfig | null = null;

  public async getAppRemoteConfig() {
    if (!this.appRemoteConfig) {
      this.appRemoteConfig = await this.fetchConfig();
    }

    return this.appRemoteConfig;
  }

  private async fetchConfig(): Promise<AppRemoteConfig> {
    try {
      const response = await axios.get<AppRemoteConfig>(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/display.json`
      );

      return response.data;
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
