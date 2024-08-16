import mixpanel from 'mixpanel-browser';

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

export const initMixpanel = () => {
  if (typeof window !== 'undefined') {
    const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
    if (!mixpanelToken) {
      throw new Error('Mixpanel token is not defined');
    }

    mixpanel.init(mixpanelToken, {
      debug: process.env.NODE_ENV !== 'production',
    });
    mixpanel.register({
      user_agent: navigator.userAgent,
    });
  }
};

export const trackTimeEvent = (eventName: MixpanelEventName) => {
  mixpanel.time_event(eventName);
};

const trackEvent = (
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

export const trackDailyEvent = (
  tokenID: string,
  tokenName: string,
  isSendBeacon?: boolean
) => {
  const CastArtworkEventProperties: CastArtworkEventProperties = {
    castingType: CastingArtworkType.Daily,
    tokenID,
    tokenName,
  };
  trackEvent(
    MixpanelEventName.CastArtworkEventName,
    CastArtworkEventProperties,
    isSendBeacon
  );
};

export const trackExhibitionCastArtworkEvent = (
  tokenID: string,
  tokenName: string,
  isSendBeacon?: boolean
) => {
  const CastArtworkEventProperties: CastArtworkEventProperties = {
    castingType: CastingArtworkType.Exhibition,
    tokenID,
    tokenName,
  };
  trackEvent(
    MixpanelEventName.CastArtworkEventName,
    CastArtworkEventProperties,
    isSendBeacon
  );
};

export const trackPlaylistCastArtworkEvent = (
  tokenID: string,
  tokenName: string,
  isSendBeacon?: boolean
) => {
  const CastArtworkEventProperties: CastArtworkEventProperties = {
    castingType: CastingArtworkType.Playlist,
    tokenID,
    tokenName,
  };
  trackEvent(
    MixpanelEventName.CastArtworkEventName,
    CastArtworkEventProperties,
    isSendBeacon
  );
};

export default mixpanel;
