import {
  NETWORK_ERROR_RETRY_COUNT,
  NETWORK_ERROR_RETRY_DELAY,
} from '@/constants';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

// Sleep function for delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Error handler for axios instances
const handleAxiosError = async (error: AxiosError): Promise<AxiosResponse> => {
  console.log('[Axios Error] Error:', JSON.stringify(error));

  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error('[Axios Error] Response:', {
      status: error.response.status,
      data: error.response.data,
      headers: error.response.headers,
    });
  } else if (error.request) {
    // The request was made but no response was received
    console.error('[Axios Error] Request:', error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('[Axios Error] Message:', error.message);
  }

  if (error.code === 'ERR_NETWORK') {
    console.log('[Axios Error] Network error: ' + error.message);

    // Get retry count from config (initialize if not exists)
    const config = error.config as AxiosRequestConfig & {
      __retryCount?: number;
    };
    config.__retryCount = config.__retryCount ?? 0;

    // Retry if under max retries
    if (config.__retryCount < NETWORK_ERROR_RETRY_COUNT) {
      config.__retryCount++;
      const delayTime =
        NETWORK_ERROR_RETRY_DELAY * Math.pow(2, config.__retryCount - 1); // Exponential backoff

      console.log(
        `[Axios Retry] Attempt ${String(config.__retryCount)}/${String(NETWORK_ERROR_RETRY_COUNT)} after ${String(delayTime)}ms`
      );

      await sleep(delayTime);

      // Retry the request
      return axios.request(config);
    } else {
      console.error('[Axios Error] Max retries exceeded, giving up');
    }
  }

  return Promise.reject(error);
};

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add error interceptor to main axios instance
axiosInstance.interceptors.response.use(response => response, handleAxiosError);

export const supportAxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_SUPPORT_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_SUPPORT_API_KEY,
  },
});

// Add error interceptor to support axios instance
supportAxiosInstance.interceptors.response.use(
  response => response,
  handleAxiosError
);

export default axiosInstance;
