import { AppSettings } from '@/constants';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class AppService {
  private static instance: AppService | null = null;
  private static currentVersion: string;
  private static isFirstOpen?: boolean = undefined;
  private static versionCheckIntervalDuration: number;

  public static getInstance(): AppService {
    if (!AppService.instance) {
      AppService.instance = new AppService();
    }

    return AppService.instance;
  }

  public static async getVersionCheckIntervalDuration() {
    if (!this.versionCheckIntervalDuration) {
      this.versionCheckIntervalDuration = await this.getDurationFromConfig();
    }

    return this.versionCheckIntervalDuration;
  }

  public static async getCurrentVersion() {
    if (!this.currentVersion) {
      this.currentVersion = await this.getVersion();
    }

    return this.currentVersion;
  }

  public static async getVersion() {
    const response = await axios.get(
      `https://display.feralfile.com/version.json?t=${Date.now().toString()}`
    );
    // eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access
    this.currentVersion = response.data['version'] as string;
    // eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access
    return response.data['version'] as string;
  }

  public static getIsFirstOpen(path?: string) {
    if (this.isFirstOpen === undefined && path === '/') {
      this.isFirstOpen = true;
    }

    return this.isFirstOpen;
  }

  public static setIsFirstOpen(value: boolean) {
    this.isFirstOpen = value;
  }

  private static async getDurationFromConfig() {
    try {
      const response = await axios.get(
        `${
          process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''
        }/configs/display_app/configs.json`
      );
      console.log('Config:', response.data);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return response.data.duration as number;
    } catch (error) {
      console.log('Failed to load config:', error);
      // Return default value if failed to load config
      return AppSettings.VERSION_CHECK_INTERVAL_DURATION;
    }
  }
}

export default AppService;
