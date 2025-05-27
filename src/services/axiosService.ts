import axios, { AxiosError } from 'axios';

// Error handler for axios instances
const handleAxiosError = (error: AxiosError) => {
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
    alert('[Axios Error] Network error: ' + error.message);
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
