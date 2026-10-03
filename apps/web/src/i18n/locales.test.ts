import { describe, expect, it } from 'vitest';
import { localeDirection, matchLocale, negotiateLocale } from './locales';
import { POST } from '../app/api/locale/route';
import { NextRequest } from 'next/server';
import en from '../../messages/en/common.json';
import he from '../../messages/he/common.json';
import { createTranslator } from 'next-intl';

describe('locale foundation', () => {
  it('uses saved choice, then weighted browser preference, then English', () => {
    expect(negotiateLocale('en', 'he')).toBe('en');
    expect(negotiateLocale(undefined, 'fr, en;q=0.5, he-IL;q=0.9')).toBe('he');
    expect(negotiateLocale('bad_tag', 'he;q=0,en;q=0.4')).toBe('en');
    expect(negotiateLocale(undefined, 'he;q=2, en;q=0.1')).toBe('en');
    expect(negotiateLocale(undefined, 'fr')).toBe('en');
    expect(matchLocale('HE-il')).toBe('he');
    expect(matchLocale('../he')).toBeUndefined();
  });
  it('uses script direction, including explicit script overrides', () => {
    expect(localeDirection('he')).toBe('rtl');
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    expect(localeDirection('az-Arab')).toBe('rtl');
    expect(localeDirection('bad_tag')).toBe('ltr');
  });
  it('has matching common keys and formats gallery positions through ICU', () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    const t = createTranslator({ locale: 'he', messages: { common: he } });
    expect(t('common.imagePosition', { current: 2, count: 4 })).toBe('2 מתוך 4');
  });
  it('sets a persistent HttpOnly choice and rejects invalid or cross-origin writes', async () => {
    const request = (body: string, origin = 'http://localhost') =>
      new NextRequest('http://localhost/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin },
        body,
      });
    const response = await POST(request('{"locale":"he"}'));
    expect(response.status).toBe(200);
    expect(response.cookies.get('wishscene_locale')?.value).toBe('he');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await POST(request('{"locale":"../../he"}'))).status).toBe(400);
    expect((await POST(request('null'))).status).toBe(400);
    expect((await POST(request('not json'))).status).toBe(400);
    expect((await POST(request('{"locale":"he"}', 'https://other.test'))).status).toBe(403);
  });
});

import { mergeMessages } from './messages';
import { catalogs } from './catalogs';
import { localeName } from './locales';

describe('catalog fallback and ICU', () => {
  it('falls back per key and namespace, warning only for missing entries', () => {
    const missing: string[] = [];
    const messages = mergeMessages(
      { common: { hello: 'Hello', goodbye: 'Goodbye' }, studio: { save: 'Save' } },
      { common: { hello: 'שלום' } },
      (ns, key) => missing.push(`${ns}.${key}`),
    );
    expect(messages).toEqual({
      common: { hello: 'שלום', goodbye: 'Goodbye' },
      studio: { save: 'Save' },
    });
    expect(missing).toEqual(['common.goodbye', 'studio.save']);
  });
  it('uses all six Arabic cardinal categories and locale numbers', () => {
    const t = createTranslator({
      locale: 'ar',
      messages: {
        count: '{n, plural, zero {zero} one {one} two {two} few {few} many {many} other {other}}',
        number: '{n, number}',
      },
    });
    expect([0, 1, 2, 3, 11, 100].map((n) => t('count', { n }))).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other',
    ]);
    expect(t('number', { n: 1234.5 })).toBe(new Intl.NumberFormat('ar').format(1234.5));
  });
  it('preserves ICU arguments and plurals through both pseudo-locales', () => {
    for (const locale of ['en-XA', 'ar-XB']) {
      const t = createTranslator({ locale, messages: catalogs[locale] });
      expect(t('studio.candidateCount', { count: 2 })).toContain('2');
      expect(t('common.imagePosition', { current: 2, count: 4 })).toContain('4');
      expect(t('studio.disclosure')).not.toBe(catalogs.en.studio.disclosure);
    }
    expect(localeDirection('ar-XB')).toBe('rtl');
    expect(localeName('he')).toBe('עברית');
    expect(localeName('en')).toBe('English');
  });
});
