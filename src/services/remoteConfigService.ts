import { AppSettings } from '@/constants';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export interface AppRemoteConfig {
  duration: number;
  new_daily_hour: number;
}

class RemoteConfigService {
  private appRemoteConfig: AppRemoteConfig | null = null;
  private static _instance: RemoteConfigService | undefined;

  static getInstance(): RemoteConfigService {
    if (!RemoteConfigService._instance) {
      RemoteConfigService._instance = new RemoteConfigService();
    }
    return RemoteConfigService._instance;
  }

  public async getAppRemoteConfig() {
    if (!this.appRemoteConfig) {
      try {
        this.appRemoteConfig = await this.fetchConfig();
      } catch (error) {
        console.log('[API] Failed to load config:', error);
        Sentry.captureException(error);
        // Return default value if failed to load config
        return {
          duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
          new_daily_hour: AppSettings.DEFAULT_NEW_DAILY_HOUR,
        };
      }
    }

    return this.appRemoteConfig;
  }

  private async fetchConfig(): Promise<AppRemoteConfig> {
    const response = await axios.get<AppRemoteConfig>(
      `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/display.json`
    );

    return response.data;
  }
}

export const remoteConfigService = RemoteConfigService.getInstance();
