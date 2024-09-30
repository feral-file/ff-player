import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(() => {
  const locale = 'en';

  return {
    locale,
  };
});
