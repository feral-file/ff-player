import { match } from '@formatjs/intl-localematcher';

const SUPPORTED_LOCALES = ['en', 'ja'];
const DEFAULT_LOCALE = 'en';

export function getUserLocale() {
  let languages: string[] = [];

  if (typeof window !== 'undefined') {
    // Client-side context
    languages = [navigator.language];
    console.log('Client-side languages:', languages);
  } else {
    languages = [];
  }

  return match(languages, SUPPORTED_LOCALES, DEFAULT_LOCALE);
}
