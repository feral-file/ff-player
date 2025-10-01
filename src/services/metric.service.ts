import { LocalStorageItem } from '@/constants';
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
    const deviceID = DeviceManager.getDeviceId();
    if (!deviceID) {
      throw new Error('Device ID not found');
    }

    accountsRequester.defaults.headers['x-device-id'] = deviceID;
  }

  // Add x-device-name to headers if not exists
  if (!accountsRequester.defaults.headers['x-device-name']) {
    const name = DeviceManager.getName();
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
  console.log('[METRIC]: append event to localStorage, length: ', event.length);
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
