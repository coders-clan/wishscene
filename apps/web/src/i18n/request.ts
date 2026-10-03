import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeCookie, negotiateLocale } from './locales';
import commonEn from '../../messages/en/common.json';
import commonHe from '../../messages/he/common.json';
import authEn from '../../messages/en/auth.json';
import authHe from '../../messages/he/auth.json';
import metadataEn from '../../messages/en/metadata.json';
import metadataHe from '../../messages/he/metadata.json';

// hunch-why: Locale stays cookie-based so existing OAuth callbacks and feedback links keep their paths; see docs/adr/0003-internationalization.md.
export default getRequestConfig(async () => {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale = negotiateLocale(
    store.get(localeCookie)?.value,
    requestHeaders.get('accept-language') ?? '',
  );
  return {
    locale,
    timeZone: 'UTC',
    messages: {
      common: locale === 'he' ? { ...commonEn, ...commonHe } : commonEn,
      auth: locale === 'he' ? { ...authEn, ...authHe } : authEn,
      metadata: locale === 'he' ? { ...metadataEn, ...metadataHe } : metadataEn,
    },
  };
});
