'use client';
import { localeDirection } from './locales';
import { useLocale, useTranslations } from 'next-intl';
import { ClientApiError } from './api-error';

/** Isolate user strings so mixed-script names, URLs and punctuation cannot reorder UI text. */
export function useCopy(namespace: string) {
  const rtl = localeDirection(useLocale()) === 'rtl';
  const translate = useTranslations(namespace);
  const common = useTranslations('common');
  function msg(key: string, values?: Record<string, string | number | Date>) {
    const isolated =
      values &&
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          typeof value === 'string' && name !== 'cover' && (rtl || /[֐-ࣿ]/.test(value))
            ? `\u2068${value}\u2069`
            : value,
        ]),
      );
    return translate(key, isolated);
  }
  msg.error = (error: unknown) => {
    if (error instanceof ClientApiError) {
      const key = `error_${error.code}`;
      return common(common.has(key) ? key : 'error_GENERIC');
    }
    if (error instanceof TypeError) return common('error_NETWORK');
    return error instanceof Error ? error.message : common('error_GENERIC');
  };
  return msg;
}
