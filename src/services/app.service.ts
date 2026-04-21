import axios from 'axios';

/**
 * Caches the current app version so the browser can compare the deployed
 * `version.json` against a stable in-memory value without refetching on every
 * render. The static device-local bundle disables this path at build time.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class AppService {
  private static instance: AppService | null = null;
  private static currentVersion: string | null = null;

  public static getInstance(): AppService {
    AppService.instance ??= new AppService();

    return AppService.instance;
  }

  public static async getCurrentVersion() {
    this.currentVersion ??= await this.getVersion();

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
}

export default AppService;
