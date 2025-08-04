import { LocalStorageItem, PLATFORM, VENDOR } from '@/constants';
import { ExhibitionDisplaySection, MetricEvent } from '@/models/metric.model';
import { deviceManager } from '@/utils/DeviceManager';
import axios, { AxiosInstance } from 'axios';
import * as Sentry from '@sentry/nextjs';
import { ExhibitionCatalog } from '@/models';

const accountsRequester: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
  headers: {
    'x-api-key': process.env.NEXT_PUBLIC_ACCOUNTS_API_KEY,
  },
});

export async function uploadNewMetric(events: MetricEvent[]): Promise<void> {
  if (!events.length) {
    return;
  }

  // Add x-device-id to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-id']) {
    const deviceID = deviceManager.getDeviceId();
    if (!deviceID) {
      throw new Error('Device ID not found');
    }

    accountsRequester.defaults.headers['x-device-id'] = deviceID;
  }

  // Add x-device-vendor to headers if not exists
  if (
    !accountsRequester.defaults.headers['x-device-vendor'] ||
    !accountsRequester.defaults.headers['x-device-platform']
  ) {
    const { vendor, platform } = getDeviceInfoBaseOnPlatform();
    accountsRequester.defaults.headers['x-device-vendor'] = vendor;
    accountsRequester.defaults.headers['x-device-platform'] = platform;
  }

  // Add x-device-model to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-model']) {
    const model = deviceManager.getDeviceModel();
    accountsRequester.defaults.headers['x-device-model'] = model;
  }

  // Add x-device-name to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-name']) {
    const name = deviceManager.getName();
    accountsRequester.defaults.headers['x-device-name'] = name;
  }

  console.log('[METRIC]: sending API', JSON.stringify(events));
  console.log(
    '[METRIC]: headers',
    JSON.stringify(accountsRequester.defaults.headers)
  );
  await accountsRequester.post('/apis/metrics', { metrics: events });
}

export function appendMetricEventToLocalStorage(
  event: MetricEvent[],
  uploadAfterAppend = false
) {
  console.log('[METRIC]: append event to localStorage', JSON.stringify(event));
  const metricEvents = localStorage.getItem(LocalStorageItem.metricEvents);
  let events: MetricEvent[] = [];
  if (metricEvents) {
    try {
      events = JSON.parse(metricEvents) as MetricEvent[];
    } catch (error) {
      console.error(
        '[METRIC] Error parsing metric events from local storage',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      events = [];
    }
  }

  events.push(...event);
  localStorage.setItem(LocalStorageItem.metricEvents, JSON.stringify(events));
  if (uploadAfterAppend) {
    uploadMetricEventsFromLocalStorage();
  }
}

export function uploadMetricEventsFromLocalStorage() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!localStorage) {
    return;
  }

  console.log('[METRIC]: start uploading events from localStorage');
  const metricEvents = localStorage.getItem(LocalStorageItem.metricEvents);
  let events: MetricEvent[] = [];
  if (metricEvents) {
    try {
      events = JSON.parse(metricEvents) as MetricEvent[];
    } catch (error) {
      localStorage.removeItem(LocalStorageItem.metricEvents);
      console.error(
        '[METRIC] Error parsing metric events from local storage',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      events = [];
    }
  }

  if (events.length > 0) {
    localStorage.removeItem(LocalStorageItem.metricEvents);
    uploadNewMetric(events).catch((error: unknown) => {
      appendMetricEventToLocalStorage(events);

      console.error(
        '[METRIC] Error uploading metric events',
        JSON.stringify(error)
      );
    });
  }
}

function getDeviceInfoBaseOnPlatform(): { vendor: string; platform: string } {
  return { vendor: VENDOR, platform: PLATFORM };
}

export function mappingExhibitionCatalogToExhibitionDisplaySection(
  castingSection: ExhibitionCatalog
): ExhibitionDisplaySection {
  switch (castingSection) {
    case ExhibitionCatalog.home:
      return ExhibitionDisplaySection.Home;
    case ExhibitionCatalog.curatorNote:
    case ExhibitionCatalog.resource:
    case ExhibitionCatalog.resourceDetail:
      return ExhibitionDisplaySection.CuratorNote;
    case ExhibitionCatalog.artwork:
      return ExhibitionDisplaySection.Artworks;
  }
}
