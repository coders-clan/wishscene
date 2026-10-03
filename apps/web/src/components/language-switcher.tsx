'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localeNames, supportedLocales } from '@/i18n/locales';

export function LanguageSwitcher() {
  const id = useId();
  const locale = useLocale();
  const t = useTranslations('common');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function change(value: string) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: value }),
      });
      if (!response.ok) throw new Error('Locale update failed');
      // A full navigation also updates the server-rendered document language/direction.
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <div className="language-switcher">
      <label htmlFor={id}>{t('language')}</label>
      <select
        id={id}
        value={locale}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
      >
        {supportedLocales.map((value) => (
          <option key={value} value={value} lang={value}>
            {localeNames[value]}
          </option>
        ))}
      </select>
      {error && <span role="alert">{t('languageError')}</span>}
    </div>
  );
}
