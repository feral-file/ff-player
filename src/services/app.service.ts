import axios from 'axios';

class AppService {
  private static instance: AppService;
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

    return this.currentVersion ?? null;
  }

  public static async getVersion() {
    const response = await axios.get(
      `https://display.feralfile.com/version.json?t=${Date.now()}`
    );
    this.currentVersion = response?.data['version'] as string;
    return response?.data['version'] as string;
  }

  public static getIsFirstOpen(path?: string) {
    if (this.isFirstOpen === undefined && path === '/') {
      this.isFirstOpen = true;
    }

    return this.isFirstOpen;
  }

  public static setIsFirstOpen(value: boolean) {
    this.isFirstOpen = false;
  }
}

export default AppService;
