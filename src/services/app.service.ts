import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class AppService {
  private static instance: AppService | null = null;
  private static currentVersion: string;
  private static isFirstOpen?: boolean = undefined;

  public static getInstance(): AppService {
    if (!AppService.instance) {
      AppService.instance = new AppService();
    }

    return AppService.instance;
  }

  public static async getCurrentVersion() {
    if (!this.currentVersion) {
      this.currentVersion = await this.getVersion();
    }

    return this.currentVersion;
  }

  public static async getVersion() {
    const response = await axios.get(
      `/version.json?t=${Date.now().toString()}`
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
}

export default AppService;
