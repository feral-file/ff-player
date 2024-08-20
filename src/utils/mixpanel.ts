import mixpanel from 'mixpanel-browser';
import DeviceManager from './DeviceManager';
import { hashStringToSHA256 } from './crypto';

export interface CastArtworkEventProperties {
  casting_type: CastingArtworkType;
  token_id: string;
  token_name: string;
}

export enum CastingArtworkType {
  Unknown = 'Unknown',
  Daily = 'Daily',
  Playlist = 'Playlist',
  Exhibition = 'Exhibition',
}

export enum MixpanelEventName {
  CastArtworkEventName = 'Cast Artwork',
}

export const getHashedDeviceID = async (): Promise<string> => {
  try {
    const deviceID = await DeviceManager.getName();
    return hashStringToSHA256(deviceID);
  } catch (error) {
    console.error('Error identifying device:', error);
    return '';
  }
};

export const initMixpanel = async () => {
  if (typeof window !== 'undefined') {
    const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
    if (!mixpanelToken) {
      throw new Error('Mixpanel token is not defined');
    }

    mixpanel.init(mixpanelToken, {
      debug: process.env.NODE_ENV !== 'production',
    });
    const device_id = await getHashedDeviceID();
    mixpanel.register({
      user_agent: navigator.userAgent,
      device_id,
    });
  }
};

export const trackTimeEvent = (eventName: MixpanelEventName) => {
  mixpanel.time_event(eventName);
};

export const trackEvent = (
  eventName: MixpanelEventName,
  properties?: CastArtworkEventProperties,
  isSendBeacon = false
) => {
  mixpanel.track(
    eventName,
    properties,
    isSendBeacon ? { transport: 'sendBeacon' } : undefined
  );
};

export default mixpanel;
