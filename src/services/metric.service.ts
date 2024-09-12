import { LocalStorageItem } from '@/constants';
import { MetricEvent } from '@/models/metric.model';
import axios, { AxiosInstance } from 'axios';

const accountsRequester: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
  headers: {
    'x-api-key': process.env.NEXT_PUBLIC_ACCOUNTS_API_KEY,
  },
});

export async function uploadNewMetric(events: MetricEvent[]): Promise<void> {
  console.log('METRIC: sending API', events);
  const deviceID = localStorage.getItem(LocalStorageItem.deviceId);

  if (!deviceID) {
    throw new Error('Device ID not found');
  }

  accountsRequester.defaults.headers['x-device-id'] = deviceID;
  if (events.length > 0) {
    await accountsRequester.post('/apis/metrics', { metrics: events });
  }
}

export function appendMetricEventToLocalStorage(event: MetricEvent) {
  console.log('METRIC: append event to localStorage', event);
  const metricEvents = localStorage.getItem(LocalStorageItem.metricEvents);
  let events: MetricEvent[] = [];
  if (metricEvents) {
    try {
      events = JSON.parse(metricEvents) as MetricEvent[];
    } catch (error) {
      console.error('Error parsing metric events from local storage', error);
      events = [];
    }
  }

  events.push(event);
  localStorage.setItem(LocalStorageItem.metricEvents, JSON.stringify(events));
  uploadMetricEventsFromLocalStorage();
}

export function uploadMetricEventsFromLocalStorage() {
  console.log('METRIC: start uploading events from localStorage');
  const metricEvents = localStorage.getItem(LocalStorageItem.metricEvents);
  let events: MetricEvent[] = [];
  if (metricEvents) {
    try {
      events = JSON.parse(metricEvents) as MetricEvent[];
    } catch (error) {
      localStorage.removeItem(LocalStorageItem.metricEvents);
      console.error('Error parsing metric events from local storage', error);
      events = [];
    }
  }

  if (events.length > 0) {
    uploadNewMetric(events)
      .then(() => {
        localStorage.removeItem(LocalStorageItem.metricEvents);
      })
      .catch((error: unknown) => {
        console.error('Error uploading metric events', error);
      });
  }
}
