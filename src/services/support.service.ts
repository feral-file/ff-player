import DeviceManager from '@/utils/DeviceManager';
import { supportAxiosInstance } from './axiosService';
import createBranchLink from '@/utils/createBranchLink';

export enum SupportRequestReason {
  Lagging = 'Lagging',
  Ratio = 'Aspect Ratio',
  Other = 'Other issues',
}

export class SupportService {
  public async submitSupportRequest(
    tokenID: string,
    reasons: SupportRequestReason[]
  ) {
    try {
      const deviceInfo = await DeviceManager.getDeviceInfo(true);
      if (!deviceInfo) {
        return null;
      }

      const response = await supportAxiosInstance.post<{ reportID: string }>(
        '/artwork-reports',
        {
          tokenID,
          reasons,
          deviceInfo,
        }
      );

      return response.data;
    } catch (error) {
      console.log(
        '[API] Failed to submit support request:',
        JSON.stringify(error)
      );
    }
  }

  public async generateSupportConnectionLink(
    reportId: string
  ): Promise<string | null> {
    try {
      const data = {
        source: 'feralfile_display',
        reportId,
      };

      return await createBranchLink(data);
    } catch (error) {
      console.error(
        '[DEVICE] Error generate support connection link: ',
        JSON.stringify(error)
      );
      return null;
    }
  }
}
