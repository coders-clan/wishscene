import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Github } from 'lucide-react';
import { authMode, readSessionToken, safeNext, SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const errorMessages: Record<string, string> = {
  state: 'Sign-in expired. Please try again.',
  denied: 'GitHub sign-in was cancelled.',
  github: 'GitHub sign-in failed. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const mode = authMode();
  if (mode.mode === 'open') redirect('/');
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  const store = await cookies();
  if (readSessionToken(store.get(SESSION_COOKIE)?.value)) redirect(next);
  const message = error ? errorMessages[error] : undefined;
  return (
    <main className="login">
      <div className="login-card">
        <span className="wordmark">
          wishscene<span className="brand-dot">.</span>
        </span>
        <p>Sign in with your GitHub account to add feedback, reply, vote and help triage.</p>
        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}
        <a
          className="button primary login-button"
          href={`/api/auth/github?next=${encodeURIComponent(next)}`}
        >
          <Github size={18} />
          Sign in with GitHub
        </a>
      </div>
    </main>
  );
}
