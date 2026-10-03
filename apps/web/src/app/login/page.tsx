import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GithubIcon } from '@/components/github-icon';
import { authMode, readSessionToken, safeNext, SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const t = await getTranslations('auth');
  const metadata = await getTranslations('metadata');
  const mode = authMode();
  if (mode.mode === 'open') redirect('/');
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  const store = await cookies();
  if (readSessionToken(store.get(SESSION_COOKIE)?.value)) redirect(next);
  const message = error && ['state', 'denied', 'github'].includes(error) ? t(error) : undefined;
  return (
    <main className="login">
      <div className="login-card">
        <span className="wordmark">
          {metadata('manifestName')}
          <span className="brand-dot">.</span>
        </span>
        <LanguageSwitcher />
        <p>{t('introduction')}</p>
        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}
        <a
          className="button primary login-button"
          href={`/api/auth/github?next=${encodeURIComponent(next)}`}
        >
          <GithubIcon size={18} />
          {t('githubSignIn')}
        </a>
      </div>
    </main>
  );
}
