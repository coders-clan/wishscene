import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeCookie, negotiateLocale } from './locales';
import { catalogs } from './catalogs';
import { mergeMessages } from './messages';
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
    getMessageFallback: ({ namespace, key }) => catalogs.en[namespace ?? '']?.[key] ?? key,
    messages: mergeMessages(
      catalogs.en,
      catalogs[locale],
      process.env.NODE_ENV === 'development'
        ? (ns, key) => console.warn(`[i18n] Missing ${locale}/${ns}.${key}; using English`)
        : undefined,
    ),
  };
});
