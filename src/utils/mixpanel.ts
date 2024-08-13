import mixpanel, { OverridedMixpanel } from 'mixpanel-browser';
import SHA256 from 'crypto-js/sha256';
import DeviceManager from './DeviceManager';

const extendedMixpanel = mixpanel as ExtendedMixpanel;

interface ExtendedMixpanel extends OverridedMixpanel {
  has_init?: boolean;
}

interface CastArtworkEventProperties {
  castingType: CastingArtworkType;
  tokenID: string;
  tokenName: string;
}

enum CastingArtworkType {
  Daily = 'Daily',
  Playlist = 'Playlist',
  Exhibition = 'Exhibition',
}

export enum MixpanelEventName {
  CastArtworkEventName = 'Cast Artwork',
}

export const setIdentifyToDevice = async () => {
  const deviceID = await DeviceManager.getDeviceId();
  if (deviceID) {
    const hashedDeviceID = SHA256(deviceID).toString();
    mixpanel.identify(hashedDeviceID);
  }
};

export const initMixpanel = async () => {
  if (typeof window !== 'undefined' && !extendedMixpanel.has_init) {
    (mixpanel as ExtendedMixpanel).init(
      process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!,
      {
        debug: process.env.NODE_ENV !== 'production',
        persistence: 'localStorage',
      }
    );
    extendedMixpanel.has_init = true;
    mixpanel.register({
      user_agent: navigator.userAgent,
    });

    await setIdentifyToDevice();
  }
};

export const trackTimeEvent = (eventName: MixpanelEventName) => {
  mixpanel.time_event(eventName);
};

export const trackEvent = (
  eventName: MixpanelEventName,
  properties?: any,
  isSendBeacon = false
) => {
  mixpanel.track(
    eventName,
    properties,
    isSendBeacon ? { transport: 'sendBeacon' } : undefined
  );
};

export default extendedMixpanel;
