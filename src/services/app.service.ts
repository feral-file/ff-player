import axios from 'axios';

export class AppService {
  private static _instance: AppService | undefined;
  private currentVersion: string | undefined;

  static getInstance(): AppService {
    if (!AppService._instance) {
      AppService._instance = new AppService();
    }
    return AppService._instance;
  }

  public async getCurrentVersion() {
    if (!this.currentVersion) {
      this.currentVersion = await this.getVersion();
    }

    return this.currentVersion;
  }

  public setCurrentVersion(version: string) {
    this.currentVersion = version;
  }

  public async getVersion() {
    const response = await axios.get(
      `/version.json?t=${Date.now().toString()}`
    );
    // eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access
    this.currentVersion = response.data['version'] as string;
    // eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access
    return response.data['version'] as string;
  }
}

export const appService = AppService.getInstance();
