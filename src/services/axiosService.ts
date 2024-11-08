import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const supportAxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_SUPPORT_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_SUPPORT_API_KEY,
  },
});

export default axiosInstance;
