import { match } from '@formatjs/intl-localematcher';

const SUPPORTED_LOCALES = ['en', 'vi', 'ja', 'zh'];
const DEFAULT_LOCALE = 'en';

export function getUserLocale() {
  let locale = DEFAULT_LOCALE;
  let languages: string[] = [];

  if (typeof window !== 'undefined') {
    // Client-side context
    languages = [navigator.language];
    console.log('Client-side languages:', languages);
  } else {
    languages = [];
  }

  try {
    locale = match(languages, SUPPORTED_LOCALES, DEFAULT_LOCALE);
    return locale;
  } catch (error) {
    console.log('Invalid language', error);
    return DEFAULT_LOCALE;
  }
}
