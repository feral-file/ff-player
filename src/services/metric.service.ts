import { LocalStorageItem, Platform } from '@/constants';
import { MetricEvent } from '@/models/metric.model';
import DeviceManager from '@/utils/DeviceManager';
import axios, { AxiosInstance } from 'axios';
import * as Sentry from '@sentry/nextjs';

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

export function appendMetricEventToLocalStorage(event: MetricEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!localStorage) {
    return;
  }

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

  events.push(event);
  localStorage.setItem(LocalStorageItem.metricEvents, JSON.stringify(events));
  uploadMetricEventsFromLocalStorage();
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
    uploadNewMetric(events)
      .then(() => {
        localStorage.removeItem(LocalStorageItem.metricEvents);
      })
      .catch((error: unknown) => {
        console.error(
          '[METRIC] Error uploading metric events',
          JSON.stringify(error)
        );
        Sentry.captureException(error);
      });
  }
}

function getDeviceInfoBaseOnPlatform(): { vendor: string; platform: string } {
  const platform = localStorage.getItem(LocalStorageItem.platform);
  switch (platform) {
    case Platform.google:
      return { vendor: 'google', platform: 'googletv' };
    case Platform.tizen:
      return { vendor: 'samsung', platform: 'tizen' };
    case Platform.lg:
      return { vendor: 'lg', platform: 'webos' };
    case Platform.ffDevice:
      return { vendor: 'ffDevice', platform: 'ffDevice' };
    default:
      return { vendor: 'web', platform: 'web' };
  }
}
