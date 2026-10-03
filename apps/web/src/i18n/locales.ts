export const localeCookie = 'wishscene_locale';
export const supportedLocales = ['en', 'he', 'en-XA', 'ar-XB'] as const;
export type Locale = (typeof supportedLocales)[number];
/** Only explicitly partial locales may omit source keys. */
export const partialLocales: readonly string[] = [];
export function localeName(locale: string): string {
  if (locale === 'en-XA') return 'Accented (test)';
  if (locale === 'ar-XB') return 'العربية (اختبار)';
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
}

export function matchLocale(value?: string): Locale | undefined {
  if (!value) return undefined;
  try {
    const canonical = new Intl.Locale(value).toString();
    const exact = supportedLocales.find(
      (locale) => locale.toLowerCase() === canonical.toLowerCase(),
    );
    if (exact) return exact;
    const parts = canonical.split('-');
    while (parts.length > 1) {
      parts.pop();
      const match = supportedLocales.find(
        (locale) => locale.toLowerCase() === parts.join('-').toLowerCase(),
      );
      if (match) return match;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** A saved supported choice wins; browser preferences are weighted, then English. */
export function negotiateLocale(saved?: string, acceptLanguage = ''): Locale {
  const choice = matchLocale(saved);
  if (choice) return choice;
  const preferences = acceptLanguage.split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    const weight = quality ? Number(quality.trim().slice(2)) : 1;
    return { locale: matchLocale(tag), weight, index };
  });
  preferences.sort((a, b) => b.weight - a.weight || a.index - b.index);
  return (
    preferences.find(({ locale, weight }) => locale && weight > 0 && weight <= 1)?.locale ?? 'en'
  );
}

export function localeDirection(locale: string): 'ltr' | 'rtl' {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction: 'ltr' | 'rtl' };
      textInfo?: { direction: 'ltr' | 'rtl' };
    };
    const direction = info.getTextInfo?.().direction ?? info.textInfo?.direction;
    if (direction) return direction;
    return /^(ar|he|fa|ur|ps|sd|yi|dv|ug|ckb)$/.test(info.language) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
