import axios from 'axios';

/**
 * Caches the current app version so repeated checks share one network read and
 * compare against a stable in-memory value for the lifetime of the session.
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
