import { LocalStorageItem } from '@/constants';
import { ExhibitionDisplaySection, MetricEvent } from '@/models/metric.model';
import DeviceManager from '@/utils/DeviceManager';
import { ExhibitionCatalog } from '@/utils/types';
import axios, { AxiosInstance } from 'axios';

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
    const deviceID = await DeviceManager.getDeviceId();
    if (!deviceID) {
      throw new Error('Device ID not found');
    }

    accountsRequester.defaults.headers['x-device-id'] = deviceID;
  }

  // Add x-device-vendor to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-vendor']) {
    const vendor = localStorage.getItem(LocalStorageItem.platform) ?? 'web';
    accountsRequester.defaults.headers['x-device-vendor'] = vendor;
  }

  // Add x-device-model to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-model']) {
    const model = await DeviceManager.getDeviceModel();
    accountsRequester.defaults.headers['x-device-model'] = model;
  }

  // Add x-device-name to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-name']) {
    const name = await DeviceManager.getName();
    accountsRequester.defaults.headers['x-device-name'] = name;
  }

  console.log('[METRIC]: sending API', JSON.stringify(events));
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
