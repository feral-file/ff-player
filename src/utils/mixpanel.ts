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
    const deviceID = await DeviceManager.getDeviceId();
    return hashStringToSHA256(deviceID);
  } catch (error) {
    console.error('Error identifying device:', error);
    return '';
  }
};

export const registerSupperProperties = async () => {
  await DeviceManager.init();
  const device_id = await getHashedDeviceID();
  mixpanel.register({ device_id, user_agent: navigator.userAgent });
};

export const initMixpanel = () => {
  if (typeof window !== 'undefined') {
    const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
    if (!mixpanelToken) {
      throw new Error('Mixpanel token is not defined');
    }

    mixpanel.init(mixpanelToken, {
      debug: process.env.NODE_ENV !== 'production',
      loaded: () => {
        registerSupperProperties().catch((error: unknown) => {
          console.error(error);
        });
      },
    });
  }
};

export const trackTimeEvent = (eventName: MixpanelEventName) => {
  mixpanel.time_event(eventName);
};

export const trackEvent = async (
  eventName: MixpanelEventName,
  properties: CastArtworkEventProperties,
  isSendBeacon = false
) => {
  // Fix for Tizen: Tizen frame automatically clears the super props after a while
  await registerSupperProperties();
  mixpanel.track(
    eventName,
    properties,
    isSendBeacon ? { transport: 'sendBeacon' } : undefined
  );
};

export default mixpanel;
